import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPoiPassIndex } from '../poi-pass-index.js';

test('indexes repeated POI pass-bys once and preserves route order', () => {
  const pois = [
    { physicalPoiId: 'shop:1', passId: 'b', routeKm: 42, offRouteM: 5 },
    { physicalPoiId: 'shop:2', passId: 'c', routeKm: 20, offRouteM: 2 },
    { physicalPoiId: 'shop:1', passId: 'a', routeKm: 10, offRouteM: 8 },
  ];
  const index = buildPoiPassIndex(pois, () => { throw new Error('fallback should not run'); });
  assert.deepEqual(index.get('shop:1').map((poi) => poi.passId), ['a', 'b']);
  assert.deepEqual(index.get('shop:2').map((poi) => poi.passId), ['c']);
});

test('falls back to physical key when provider-neutral id is absent', () => {
  const pois = [{ osmType: 'node', osmId: 7, routeKm: 1, offRouteM: 0 }];
  const index = buildPoiPassIndex(pois, (poi) => `${poi.osmType}:${poi.osmId}`);
  assert.equal(index.get('node:7')[0], pois[0]);
});
