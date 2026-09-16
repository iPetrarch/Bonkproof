import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('pin state is distinct from routebook selection', () => {
  assert.match(app, /let pinnedPoiIds = new Set\(\)/);
  assert.match(app, /function togglePin\(poi\)/);
  assert.match(app, /data-pin-id/);
  assert.match(app, /class=\"poi-pin\"/);
});

test('pinned snapshots survive refreshed searches and fresh results replace fallbacks', () => {
  assert.match(app, /previousPinnedSnapshots/);
  assert.match(app, /status: 'pinned'/);
  assert.match(app, /existing\.status === 'pinned'/);
  assert.match(app, /pinnedPoiSnapshots\.set\(key, \{ \.\.\.poi \}\)/);
});

test('pinned POIs remain visible but do not automatically close found-resupply gaps', () => {
  assert.match(app, /activeCategoryIds\.has\(poi\.category\.id\) \|\| pinnedPoiIds\.has\(poiKey\(poi\)\)/);
  assert.match(app, /poi\.status !== 'pinned'/);
  assert.match(styles, /\.poi-marker\.pinned/);
});

test('new routes reset pins', () => {
  assert.match(app, /pinnedPoiIds = new Set\(\);\s*pinnedPoiSnapshots = new Map\(\);\s*currentRouteDistanceMeters = parsed\.distanceMeters/);
});


test('pins survive when every category is disabled', () => {
  assert.match(app, /if \(categories\.length === 0\)[\s\S]*pinnedFallbacks[\s\S]*renderPois\(pinnedFallbacks, config\.categories\)/);
});

test('pinned and selected POIs are not duplicated on the map', () => {
  assert.match(app, /!pinnedPoiIds\.has\(poiKey\(poi\)\) && selectedPoiIds\.has\(poiKey\(poi\)\)/);
});

test('pinned fallbacks are labelled distinctly from current corridor matches', () => {
  assert.match(app, /poi\.status === 'pinned' \? 'Behalten aus vorheriger Suche'/);
  assert.match(app, /\$\{pinned \? 'pinned' : ''\}/);
});
