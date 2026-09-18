import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('app.js', 'utf8');
const deploy = fs.readFileSync('deploy.ps1', 'utf8');

test('app preserves original GPX source only for the currently loaded route', () => {
  assert.match(app, /let currentSourceGpxText = null;/);
  assert.match(app, /let currentRouteFileName = null;/);
  assert.match(app, /currentSourceGpxText = sourceGpxText;/);
  assert.match(app, /currentRouteFileName = fileName;/);
  assert.match(app, /currentSourceGpxText = null;[\s\S]*currentRouteFileName = null;/);
  assert.match(app, /renderRoute\(parsed, file\.name, text\)/);
});

test('current export uses format-neutral snapshots and existing selection state', () => {
  assert.match(app, /buildRoutePointSnapshots\(currentPois,/);
  assert.match(app, /selectedPoiIds,/);
  assert.match(app, /pinnedPoiIds,/);
  assert.match(app, /createExportFile\(format,/);
  assert.match(app, /downloadExportFile\(buildCurrentRouteExport\(format\)\)/);
});

test('local deployment includes every new runtime export module', () => {
  assert.match(deploy, /'export-model\.js'/);
  assert.match(deploy, /'export-core\.js'/);
});
