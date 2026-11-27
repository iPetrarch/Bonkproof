import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const worker = readFileSync('sw.js', 'utf8');
const shell = JSON.parse(worker.match(/const SHELL = ({[\s\S]*?});/)[1]);
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

test('PWA manifest opens at the same scope when deployed under a subpath', () => {
  const address = new URL('https://example.test/bonkproof/manifest.json');
  assert.equal(new URL(manifest.start_url, address).href, 'https://example.test/bonkproof/');
  assert.equal(new URL(manifest.scope, address).href, 'https://example.test/bonkproof/');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    assert.ok(shell[icon.src]);
    const data = readFileSync(icon.src);
    assert.equal(data.subarray(1, 4).toString(), 'PNG');
    assert.equal(icon.sizes, `${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`);
  }
  assert.ok(shell['icons/apple-touch-icon.png']);
});

test('the integrity checked offline shell covers all static release files and excludes the POI API', () => {
  const generator = readFileSync('scripts/create-sftp-manifest.mjs', 'utf8');
  const files = [...generator.match(/const files = \[([\s\S]*?)\n\];/)[1].matchAll(/'([^']+)'/g)].map(([, file]) => file);
  const staticFiles = files.filter((path) => path !== 'sw.js' && !path.startsWith('api/'));
  assert.deepEqual(Object.keys(shell).toSorted(), staticFiles.toSorted());
  for (const [path, expected] of Object.entries(shell)) {
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expected, path);
  }
});
