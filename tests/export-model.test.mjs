import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoutePointSnapshot, buildRoutePointSnapshots, normalizePoiDescription } from '../export-model.js';
import { poiKey } from '../routebook.js';

const poi = {
  osmType: 'node',
  osmId: 123,
  physicalPoiId: 'node/123',
  passId: 'pass-2',
  passIndex: 2,
  passCount: 3,
  name: 'Testmarkt',
  tags: { description: '24/7 Automat im Eingangsbereich', note: 'interne Mapper-Notiz' },
  category: { id: 'supermarket', label: 'Supermarkt' },
  lat: 53.1,
  lon: 7.3,
  routeKm: 84.6,
  offRouteM: 75,
  status: 'match',
};

test('description normalization uses explicit OSM description only', () => {
  assert.equal(normalizePoiDescription(poi.tags), '24/7 Automat im Eingangsbereich');
  assert.equal(normalizePoiDescription({ note: 'do not expose this as description' }), '');
  assert.equal(normalizePoiDescription({ description: '  trimmed  ' }), 'trimmed');
});

test('route point snapshot is format-neutral and carries selection, pin and source identity', () => {
  const id = poiKey(poi);
  const snapshot = buildRoutePointSnapshot(poi, {
    poiKey,
    selectedPoiIds: new Set([id]),
    pinnedPoiIds: new Set([id]),
  });

  assert.equal(snapshot.id, id);
  assert.equal(snapshot.name, 'Testmarkt');
  assert.equal(snapshot.description, '24/7 Automat im Eingangsbereich');
  assert.equal(snapshot.lat, 53.1);
  assert.equal(snapshot.lon, 7.3);
  assert.equal(snapshot.routeKm, 84.6);
  assert.equal(snapshot.offRouteM, 75);
  assert.equal(snapshot.categoryId, 'supermarket');
  assert.equal(snapshot.selected, true);
  assert.equal(snapshot.pinned, true);
  assert.deepEqual(snapshot.sourceIdentity, {
    provider: 'openstreetmap',
    osmType: 'node',
    osmId: 123,
  });
  assert.deepEqual(snapshot.passIdentity, {
    physicalPoiId: 'node/123',
    passId: 'pass-2',
    passIndex: 2,
    passCount: 3,
  });
});

test('snapshot derives normalized description from tags when legacy POI has no description field', () => {
  const snapshot = buildRoutePointSnapshot(poi, { poiKey });
  assert.equal(snapshot.description, '24/7 Automat im Eingangsbereich');
});

test('snapshot collection preserves independent pass-bys and explicit false UI states', () => {
  const first = { ...poi, passId: 'pass-1', passIndex: 1, routeKm: 10 };
  const second = { ...poi, passId: 'pass-2', passIndex: 2, routeKm: 90 };
  const snapshots = buildRoutePointSnapshots([first, second], { poiKey });

  assert.equal(snapshots.length, 2);
  assert.notEqual(snapshots[0].id, snapshots[1].id);
  assert.equal(snapshots[0].selected, false);
  assert.equal(snapshots[0].pinned, false);
});
