import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import test from 'node:test';

test('all deployment paths publish the same files and cover transitive local JS dependencies', () => {
  const generator = readFileSync('scripts/create-sftp-manifest.mjs', 'utf8');
  const manifestFiles = generator.match(/const files = \[([\s\S]*?)\n\];/)[1];
  const central = [...manifestFiles.matchAll(/'([^']+)'/g)].map(([, file]) => file);
  const powershell = readFileSync('deploy.ps1', 'utf8').match(/\$publishFiles = @\(([\s\S]*?)\n\)/)[1];
  const local = [...powershell.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
  const github = [...workflow.matchAll(/^\s+put\s+(\S+)(?:[ \t]+(\S+))?[ \t]*$/gm)].map(([, file, destination]) => {
    assert.equal(destination ?? file, file, `deployment destination for ${file}`);
    return file;
  });
  for (const [name, files] of [['PowerShell', local], ['GitHub', github]]) {
    assert.deepEqual(files.toSorted(), central.toSorted(), name);
  }

  const dependencies = ['index.html'];
  const visited = new Set();
  for (const file of dependencies) {
    assert.ok(central.includes(file), `missing release dependency: ${file}`);
    if (visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, 'utf8');
    const links = file.endsWith('.html')
      ? source.matchAll(/(?:<script\b[^>]*\bsrc=|\bimport\s*\(\s*)["']([^"']+\.js)["']/g)
      : source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.{1,2}\/[^"']+\.js)["']/g);
    for (const [, link] of links) dependencies.push(posix.normalize(posix.join(posix.dirname(file), link)));
  }
});
