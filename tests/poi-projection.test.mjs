import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRouteGeometry, physicalPoiKey, projectPoiPassBys } from '../poi-projection.js';

function route(...points) {
  return { segments: [points] };
}

test('one physical POI can produce two route pass-bys', () => {
  const parsed = route(
    { lat: 53.0000, lon: 7.0000 },
    { lat: 53.0000, lon: 7.0100 },
    { lat: 53.0200, lon: 7.0100 },
    { lat: 53.0000, lon: 7.0100 },
    { lat: 53.0000, lon: 7.0000 },
  );
  const geometry = buildRouteGeometry(parsed);
  const poi = { lat: 53.0002, lon: 7.0050, osmType: 'node', osmId: 42 };
  const passBys = projectPoiPassBys(poi, geometry, 100);

  assert.equal(physicalPoiKey(poi), 'node/42');
  assert.equal(passBys.length, 2);
  assert.deepEqual(passBys.map((pass) => pass.passIndex), [1, 2]);
  assert.deepEqual(passBys.map((pass) => pass.passCount), [2, 2]);
  assert.ok(passBys[0].routeKm < passBys[1].routeKm);
  assert.ok(passBys.every((pass) => pass.distanceM < 100));
});

test('adjacent route segments around one encounter collapse to one pass-by', () => {
  const parsed = route(
    { lat: 53.0000, lon: 7.0000 },
    { lat: 53.0000, lon: 7.0040 },
    { lat: 53.0000, lon: 7.0080 },
    { lat: 53.0000, lon: 7.0120 },
  );
  const geometry = buildRouteGeometry(parsed);
  const passBys = projectPoiPassBys({ lat: 53.0002, lon: 7.0060 }, geometry, 100);

  assert.equal(passBys.length, 1);
  assert.equal(passBys[0].passCount, 1);
});

test('a spatially close return later in the ride remains a separate pass-by', () => {
  const parsed = route(
    { lat: 53.0000, lon: 7.0000 },
    { lat: 53.0000, lon: 7.0100 },
    { lat: 53.0300, lon: 7.0100 },
    { lat: 53.0000, lon: 7.0100 },
    { lat: 53.0000, lon: 7.0000 },
  );
  const geometry = buildRouteGeometry(parsed);
  const passBys = projectPoiPassBys({ lat: 53.0001, lon: 7.0020 }, geometry, 100);

  assert.equal(passBys.length, 2);
  assert.ok(passBys[1].routeMeters - passBys[0].routeMeters > 1000);
});
