import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const dir = mkdtempSync(join(tmpdir(), 'bonkproof-sftp-'));
try {
  const output = join(dir, 'manifest.json');
  assert.equal(spawnSync(process.execPath, ['scripts/create-sftp-manifest.mjs', 'a'.repeat(40), output]).status, 0);
  const manifest = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(manifest.service, 'bonkproof');
  assert.equal(manifest.repository, 'iPetrarch/Bonkproof');
  assert.ok(manifest.files.includes('vendor/leaflet/leaflet.js'));
  assert.ok(manifest.files.includes('vendor/leaflet/images/marker-icon.png'));
  assert.ok(!manifest.files.some((path) => path.includes('data/') || path.endsWith('.sqlite')));
} finally { rmSync(dir, {recursive: true, force: true}); }
