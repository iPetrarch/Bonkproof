import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRouteGeometry, projectPoiPassBys } from '../poi-projection.js';
import { createProject, snapshotProjectPoi, validateProject } from '../project-format.js';
import { createProjectStore } from '../project-store.js';
import { buildFoundPoiWarnings, buildRoutebook, DEFAULT_GAP_SETTINGS, poiKey } from '../routebook.js';

const parsed = {
  segments: [[{ lat: 52, lon: 9 }, { lat: 52, lon: 10 }, { lat: 52, lon: 9 }]],
};
const geometry = buildRouteGeometry(parsed);
parsed.distanceMeters = geometry.reduce((meters, edge) => meters + edge.lengthM, 0);
const raw = '<gpx><trk><trkseg><trkpt lat="52" lon="9"/><trkpt lat="52" lon="10"/><trkpt lat="52" lon="9"/></trkseg></trk></gpx>';
const parseRoute = (gpx) => {
  assert.equal(gpx, raw);
  return parsed;
};
const category = { id: 'supermarket', label: 'Supermarket', defaultRadiusM: 250 };

function fixture() {
  const visits = projectPoiPassBys({ lat: 52, lon: 9.5 }, geometry, 250).map((pass) => snapshotProjectPoi({
    ...pass, osmType: 'node', osmId: '42', name: '<Markt & Café>', offRouteM: pass.distanceM,
    category, status: 'match', tags: { shop: 'supermarket' }, lat: 52, lon: 9.5,
  }));
  const end = geometry[0].lengthM;
  const accepted = { ...visits[0], osmId: 43, scoped: true, scopeKey: `0/${end}` };
  return createProject('Tour', {
    projectionVersion: 1,
    route: { fileName: 'tour.gpx', gpx: raw },
    global: { enabled: ['supermarket'], radii: [['supermarket', 250]], loadedRadii: [['supermarket', 300]], coverage: 'complete' },
    scopes: [{ start: 0, end, enabled: ['supermarket'], radii: [['supermarket', 600]] }],
    pois: [...visits, accepted],
    accepted: [accepted],
    selected: [poiKey(visits[0]), poiKey(accepted)],
    pins: [poiKey(visits[1])],
    gaps: { ...DEFAULT_GAP_SETTINGS, criticalDistanceKm: 40 },
    resupply: ['supermarket'],
    exportOptions: { target: 'trackkin', format: 'trackkin', gaps: true },
  }, { id: 'c'.repeat(32) }, '2026-11-26T16:30:00.000Z');
}

test('the portable roundtrip retains GPX, separate passes, selected stops, pins and scoped results', () => {
  const original = fixture();
  const revived = validateProject(JSON.parse(JSON.stringify(original)), parseRoute);
  assert.deepEqual(revived.project, original);
  const { pois, selected, pins, accepted, gaps } = revived.project.state;
  assert.deepEqual(pois.slice(0, 2).map(poiKey), ['node/42#edge-0', 'node/42#edge-1']);
  assert.deepEqual(pins, ['node/42#edge-1']);
  assert.deepEqual(accepted.map(poiKey), ['node/43#edge-0']);
  assert.equal(pois[0].name, '<Markt & Café>');
  assert.deepEqual(buildRoutebook(pois, new Set(selected), parsed.distanceMeters, gaps).stops.map(poiKey), selected);
  assert.deepEqual(buildFoundPoiWarnings(pois, parsed.distanceMeters, gaps),
    buildFoundPoiWarnings(original.state.pois, parsed.distanceMeters, original.state.gaps));
});

test('projects reject missing fields, unsupported versions, invalid coordinates and inconsistent references', () => {
  const mutate = [
    [(p) => { p.schemaVersion = 2; }, /nicht unterstützt/],
    [(p) => { delete p.state.route; }, /Planungsfelder/],
    [(p) => { p.createdAt = '2026-02-30T12:12:12.000Z'; }, /Zeitstempel/],
    [(p) => { p.state.route.gpx = '<!DOCTYPE gpx><gpx/>'; }, /GPX/],
    [(p) => { p.state.pois[0].lat = 91; }, /POI-Bestand/],
    [(p) => { p.state.pois[0].category.id = '" onclick="bad'; }, /POI-Bestand/],
    [(p) => { p.state.pois[0].passId = 'edge-1'; }, /POI-Bestand/],
    [(p) => { p.state.pins.push('node/44#edge-0'); }, /Pins/],
    [(p) => { p.state.accepted[0].scopeKey = '0/1'; }, /Abschnittszuordnung/],
    [(p) => { p.state.global.radii.push(['fuel', -100]); }, /globale Radien/],
    [(p) => { p.state.gaps.warningPercent = p.state.gaps.infoPercent; }, /percentages/],
  ];
  for (const [change, message] of mutate) {
    const invalid = fixture();
    change(invalid);
    assert.throws(() => validateProject(invalid, parseRoute), message);
  }
});

test('project updates keep the ID and created timestamp while unrelated projects receive fresh IDs', () => {
  const original = fixture();
  const renamed = createProject('Tour 2', original.state, original, '2026-11-27T16:30:00.000Z');
  assert.equal(renamed.id, original.id);
  assert.equal(renamed.createdAt, original.createdAt);
  assert.notEqual(renamed.updatedAt, original.updatedAt);
  assert.notEqual(createProject('Copy', original.state).id, original.id);
});

test('unsupported browser storage reports an error and can be retried', async () => {
  const store = createProjectStore(() => undefined);
  await assert.rejects(store.list(), /IndexedDB/);
  await assert.rejects(store.save(fixture()), /IndexedDB/);
});

test('a changed section configuration can be saved after accepting a result from an earlier search', () => {
  const project = fixture();
  const [scope] = project.state.scopes;
  scope.enabled = ['fuel'];
  scope.radii = [['fuel', 500]];
  const restored = validateProject(JSON.parse(JSON.stringify(project)), parseRoute).project;
  assert.deepEqual(restored.state.scopes[0].enabled, ['fuel']);
  assert.deepEqual(restored.state.accepted, project.state.accepted);
  assert.equal(restored.state.accepted[0].category.id, 'supermarket');
});

test('unsupported nested fields, incompatible export choices and incomplete merged snapshots are rejected', () => {
  const extra = fixture();
  extra.state.pois[0].category.unexpected = { nested: { ignoredBefore: true } };
  assert.throws(() => validateProject(extra, parseRoute), /POI-Bestand/);
  const incompatible = fixture();
  incompatible.state.exportOptions.format = 'gpx';
  assert.throws(() => validateProject(incompatible, parseRoute), /Exporteinstellungen/);
  const missing = fixture();
  missing.state.pois.pop();
  assert.throws(() => validateProject(missing, parseRoute), /POI-Referenzen/);
});

test('large accepted inventories can recompute warnings and selected routebooks without an argument overflow', () => {
  const pois = Array.from({ length: 140000 }, (_, osmId) => ({ osmType: 'node', osmId, routeKm: osmId / 1000 }));
  const selected = new Set(pois.map(poiKey));
  assert.equal(buildFoundPoiWarnings(pois, 141000).longestGapM, 1001);
  assert.equal(buildRoutebook(pois, selected, 141000).longestGapM, 1001);
});
