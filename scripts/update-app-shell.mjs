// Rebuild the worker's release identity and byte-integrity table from the shipped application files.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function updateAppShell({ check = false } = {}) {
  const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const marker = /\/\* BEGIN APP SHELL \*\/[\s\S]*?\/\* END APP SHELL \*\//;
  const worker = source.replace(marker, '/* GENERATED APP SHELL */');
  if (worker === source) throw new Error('Missing application shell markers');
  const release = readFileSync(new URL('./create-sftp-manifest.mjs', import.meta.url), 'utf8');
  const files = [...release.match(/const files = \[([\s\S]*?)\n\];/)[1].matchAll(/'([^']+)'/g)].map(([, path]) => path);
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const shell = Object.fromEntries(files.filter((path) => path !== 'sw.js' && !path.startsWith('api/'))
    .map((path) => [path, hash(readFileSync(new URL(`../${path}`, import.meta.url)))]));
  const identity = hash(worker + JSON.stringify(shell)).slice(0, 24);
  const expected = source.replace(marker, `/* BEGIN APP SHELL */\nconst RELEASE = '${identity}';\nconst SHELL = ${JSON.stringify(shell, null, 2)};\n/* END APP SHELL */`);
  if (check) {
    if (source !== expected) throw new Error('Application shell is stale. Run node scripts/update-app-shell.mjs.');
  } else {
    writeFileSync(new URL('../sw.js', import.meta.url), expected);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  updateAppShell({ check: process.argv.includes('--check') });
}
