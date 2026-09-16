import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFoundPoiWarnings, buildRoutebook, buildRoutebookWarnings, ROUTEBOOK_GAP_WARNING_M } from '../routebook.js';

const pois = [
  { osmType: 'node', osmId: 1, name: 'A', routeKm: 10, offRouteM: 20, status: 'match' },
  { osmType: 'node', osmId: 2, name: 'B', routeKm: 35, offRouteM: 20, status: 'match' },
];

test('the existing 30 km threshold remains the default', () => {
  assert.equal(ROUTEBOOK_GAP_WARNING_M, 30000);
  assert.equal(buildFoundPoiWarnings([], 30000).warnings.length, 0);
  assert.equal(buildFoundPoiWarnings([], 30001).warnings.length, 1);
});

test('found-POI warnings accept a custom threshold without changing gap geometry', () => {
  const strict = buildFoundPoiWarnings(pois, 50000, 20000);
  const relaxed = buildFoundPoiWarnings(pois, 50000, 30000);

  assert.deepEqual(strict.warnings.map((gap) => [gap.startMeters, gap.endMeters, gap.lengthM]), [[10000, 35000, 25000]]);
  assert.equal(relaxed.warnings.length, 0);
  assert.equal(strict.warningThresholdM, 20000);
});

test('routebook highlighting and warnings use the same custom threshold', () => {
  const selected = new Set(['node/1', 'node/2']);
  const routebook = buildRoutebook(pois, selected, 50000, 20000);
  const warnings = buildRoutebookWarnings(pois, selected, 50000, 20000);

  assert.equal(routebook.entries[2].distanceFromPreviousM, 25000);
  assert.equal(routebook.entries[2].isLongGap, true);
  assert.deepEqual(warnings.warnings.map((gap) => [gap.from, gap.to, gap.lengthM]), [['A', 'B', 25000]]);
  assert.equal(warnings.warningThresholdM, 20000);
});

test('a gap exactly on the configured threshold is still accepted', () => {
  assert.equal(buildFoundPoiWarnings([], 20000, 20000).warnings.length, 0);
  assert.equal(buildRoutebook([], new Set(), 20000, 20000).entries.at(-1).isLongGap, false);
});
