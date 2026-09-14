import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [rawApp, rawStyles] = await Promise.all([
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../styles.css', import.meta.url), 'utf8'),
]);
const app = rawApp.replaceAll('\r\n', '\n');
const styles = rawStyles.replaceAll('\r\n', '\n');

test('a rendered route hides the GPX import overlay', () => {
  assert.match(app, /function renderRoute\(parsed, fileName\)[\s\S]*?dropZone\.hidden = true;/);
  assert.match(styles, /\.empty-state\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
});

test('invalid GPX files keep the import overlay available while reporting an error', () => {
  const loadFile = app.match(/async function loadFile\(file\) \{([\s\S]*?)\n  \}\n\n  fileInput\.addEventListener/);
  assert.ok(loadFile, 'loadFile implementation should be present');
  assert.match(loadFile[1], /catch \(error\) \{[\s\S]*?showError\(/);
  assert.doesNotMatch(loadFile[1], /dropZone\.hidden\s*=\s*true/);
});

test('the title starts to the right of the Leaflet zoom control', () => {
  assert.match(styles, /\.topbar > div\s*\{[\s\S]*?margin-left:\s*2\.5rem;/);
});
