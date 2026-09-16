import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [app, index] = await Promise.all([
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
]);

test('OpenStreetMap raster tiles use the policy-compliant host with visible attribution', () => {
  assert.match(app, /L\.tileLayer\('https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png'/);
  assert.doesNotMatch(app, /\{s\}\.tile\.openstreetmap\.org/);
  assert.match(app, /OpenStreetMap contributors/);
  assert.match(index, /rel="preconnect" href="https:\/\/tile\.openstreetmap\.org"/);
});
