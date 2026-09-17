import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');

function between(start, end) {
  const startIndex = app.indexOf(start);
  const endIndex = app.indexOf(end, startIndex);
  assert.ok(startIndex >= 0, `missing start marker: ${start}`);
  assert.ok(endIndex > startIndex, `missing end marker: ${end}`);
  return app.slice(startIndex, endIndex);
}

test('enabling a category fetches only an uncached category', () => {
  const block = between("poiCategories.addEventListener('click'", "poiCategories.addEventListener('change'");
  assert.match(block, /!categoryIsLoaded\(categoryId\)/);
  assert.match(block, /loadPois\(currentParsedRoute, true, false, \[categoryId\], \[categoryId\]\)/);
  assert.doesNotMatch(block, /loadPois\(currentParsedRoute, true, false\);/);
});

test('radius changes invalidate and replace only the affected category', () => {
  const block = between("poiCategories.addEventListener('change'", "poiPrevious.addEventListener");
  const invalidation = block.indexOf('loadedCategoryRadii.delete(categoryId)');
  const activeGuard = block.indexOf('if (activeCategoryIds.has(categoryId)');
  assert.ok(invalidation >= 0 && invalidation < activeGuard, 'cache must be invalidated before checking whether category is active');
  assert.match(block, /loadPois\(currentParsedRoute, true, false, \[categoryId\], \[categoryId\]\)/);
});

test('gap distance settings remain local-only', () => {
  const block = between('function applyGapSettingsFromInputs()', 'function markerIcon');
  assert.doesNotMatch(block, /loadPois\(/);
  assert.doesNotMatch(block, /fetch\(/);
});

test('only confirmed local Overture responses skip legacy pacing', () => {
  assert.match(app, /let paceAfterWorkload = true/);
  assert.match(app, /response\.headers\.get\('X-Bonkproof-Poi-Provider'\) \|\| 'overpass'/);
  assert.match(app, /paceAfterWorkload = candidates\.poiProvider !== 'overture-local'/);
  assert.match(app, /if \(paceAfterWorkload && workloadPosition < workloads\.length - 1\) await waitForPoiBackoff\(1000/);
});

test('loaded category cache is radius-aware and resets with route view state', () => {
  assert.match(app, /let loadedCategoryRadii = new Map\(\)/);
  assert.match(app, /loadedCategoryRadii\.get\(categoryId\) === radiusM/);
  assert.match(app, /loadedCategoryRadii = new Map\(\)/);
  assert.match(app, /loadedCategoryRadii\.set\(category\.id, category\.radiusM\)/);
});

test('successful radius replacement removes stale POIs only after the targeted request completes', () => {
  assert.match(app, /if \(incremental && replacedIds\.size > 0 && failedWorkloads\.length === 0\)/);
  assert.match(app, /filter\(\(poi\) => !replacedIds\.has\(poi\.category\.id\)\)/);
  assert.match(app, /freshQueriedPois\.forEach\(\(poi, id\) => finalPois\.set\(id, poi\)\)/);
});
