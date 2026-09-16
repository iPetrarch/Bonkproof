import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFoundPoiWarnings, buildRoutebook, poiKey } from '../routebook.js';
import { physicalPoiKey } from '../poi-projection.js';
import { routeOrderCases } from './fixtures/route-order-cases.mjs';

function selectAll(pois) {
  return new Set(pois.map(poiKey));
}

for (const [name, fixture] of Object.entries(routeOrderCases)) {
  if (name === 'repeatedPhysicalPoi') continue;

  test(`${name}: routebook follows resolved ride progression`, () => {
    const routebook = buildRoutebook(fixture.pois, selectAll(fixture.pois), fixture.routeDistanceM);
    assert.deepEqual(routebook.stops.map((poi) => poi.name), fixture.expectedOrder, fixture.description);
    assert.ok(routebook.stops.every((poi, index, stops) => index === 0 || stops[index - 1].routeKm <= poi.routeKm));
  });
}

test('repeatedPhysicalPoi: pass-bys share physical identity but have separate selection keys', () => {
  const fixture = routeOrderCases.repeatedPhysicalPoi;
  const [firstPass, secondPass] = fixture.pois;

  assert.equal(physicalPoiKey(firstPass), physicalPoiKey(secondPass));
  assert.notEqual(poiKey(firstPass), poiKey(secondPass));
  assert.notEqual(firstPass.routeKm, secondPass.routeKm);
  assert.deepEqual([firstPass.lat, firstPass.lon], [secondPass.lat, secondPass.lon]);
});

test('repeatedPhysicalPoi: each pass-by can be selected independently', () => {
  const fixture = routeOrderCases.repeatedPhysicalPoi;
  const [firstPass, secondPass] = fixture.pois;

  const firstOnly = buildRoutebook(fixture.pois, new Set([poiKey(firstPass)]), fixture.routeDistanceM);
  const secondOnly = buildRoutebook(fixture.pois, new Set([poiKey(secondPass)]), fixture.routeDistanceM);
  const both = buildRoutebook(fixture.pois, selectAll(fixture.pois), fixture.routeDistanceM);

  assert.deepEqual(firstOnly.stops.map((poi) => poi.routeKm), [31]);
  assert.deepEqual(secondOnly.stops.map((poi) => poi.routeKm), [94]);
  assert.deepEqual(both.stops.map((poi) => poi.routeKm), fixture.expectedRouteKm);
});

test('repeatedPhysicalPoi: supply gaps use both resolved pass-by positions', () => {
  const fixture = routeOrderCases.repeatedPhysicalPoi;
  const result = buildFoundPoiWarnings(fixture.pois, fixture.routeDistanceM);

  assert.equal(result.foundCount, 2);
  assert.deepEqual(
    result.warnings.map((warning) => [warning.from, warning.to, warning.lengthM]),
    [
      ['Start', 'Village shop', 31000],
      ['Village shop', 'Village shop', 63000],
    ],
  );
});
