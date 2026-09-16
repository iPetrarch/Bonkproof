import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFoundPoiWarnings, buildRoutebook, poiKey } from '../routebook.js';
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

test('repeatedPhysicalPoi: downstream routebook can represent multiple pass-bys of one physical POI', () => {
  const fixture = routeOrderCases.repeatedPhysicalPoi;
  const routebook = buildRoutebook(fixture.pois, selectAll(fixture.pois), fixture.routeDistanceM);

  assert.equal(new Set(fixture.pois.map(poiKey)).size, 1, 'both pass-bys intentionally share one physical OSM identity');
  assert.equal(routebook.stops.length, 2, 'routebook must not collapse distinct resolved pass-bys');
  assert.deepEqual(routebook.stops.map((poi) => poi.routeKm), fixture.expectedRouteKm);
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

test('fixtures keep physical identity separate from route position', () => {
  const fixture = routeOrderCases.repeatedPhysicalPoi;
  const [firstPass, secondPass] = fixture.pois;

  assert.equal(poiKey(firstPass), poiKey(secondPass));
  assert.notEqual(firstPass.routeKm, secondPass.routeKm);
  assert.deepEqual([firstPass.lat, firstPass.lon], [secondPass.lat, secondPass.lon]);
});
