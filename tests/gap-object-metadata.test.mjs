import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFoundPoiWarnings, buildRoutebookWarnings } from '../routebook.js';

const settings = {
  criticalDistanceKm: 30,
  infoPercent: 66,
  warningPercent: 80,
  criticalPercent: 95,
};

test('found-POI gaps expose route positions and explicit route endpoints', () => {
  const [gap] = buildFoundPoiWarnings([], 40000, settings).warnings;
  assert.equal(gap.gapType, 'resupply');
  assert.equal(gap.startMeters, 0);
  assert.equal(gap.endMeters, 40000);
  assert.equal(gap.startKm, 0);
  assert.equal(gap.endKm, 40);
  assert.equal(gap.lengthM, 40000);
  assert.equal(gap.fromKind, 'start');
  assert.equal(gap.toKind, 'route-end');
  assert.equal(gap.fromPoiId, null);
  assert.equal(gap.toPoiId, null);
  assert.equal(gap.hasPreviousQualifyingPoi, false);
  assert.equal(gap.hasNextQualifyingPoi, false);
});

test('routebook gaps retain qualifying POI identities and explicit no-next-POI state', () => {
  const pois = [
    { osmType: 'node', osmId: 1, name: 'Stop', routeKm: 10, offRouteM: 20 },
  ];
  const result = buildRoutebookWarnings(pois, new Set(['node/1']), 50000, settings);
  const gap = result.warnings.find((warning) => warning.from === 'Stop' && warning.to === 'Ziel');
  assert.ok(gap);
  assert.equal(gap.gapType, 'resupply');
  assert.equal(gap.startKm, 10);
  assert.equal(gap.endKm, 50);
  assert.equal(gap.startMeters, 10000);
  assert.equal(gap.endMeters, 50000);
  assert.equal(gap.fromKind, 'poi');
  assert.equal(gap.toKind, 'route-end');
  assert.equal(gap.fromPoiId, 'node/1');
  assert.equal(gap.toPoiId, null);
  assert.equal(gap.hasPreviousQualifyingPoi, true);
  assert.equal(gap.hasNextQualifyingPoi, false);
});

test('gap type can vary without changing the route-gap calculation', () => {
  const pois = [
    { osmType: 'node', osmId: 7, name: 'Water', routeKm: 25, offRouteM: 10, status: 'match' },
  ];
  const gap = buildFoundPoiWarnings(pois, 60000, settings, 'water').warnings.find((warning) => warning.toKind === 'route-end');
  assert.ok(gap);
  assert.equal(gap.gapType, 'water');
  assert.equal(gap.fromKind, 'poi');
  assert.equal(gap.fromPoiId, 'node/7');
  assert.equal(gap.toKind, 'route-end');
  assert.equal(gap.hasNextQualifyingPoi, false);
  assert.equal(gap.lengthM, 35000);
});

test('gaps between qualifying POIs retain both endpoint identities', () => {
  const pois = [
    { osmType: 'node', osmId: 1, name: 'A', routeKm: 5, offRouteM: 10, status: 'match' },
    { osmType: 'way', osmId: 2, name: 'B', routeKm: 40, offRouteM: 15, status: 'match' },
  ];
  const gap = buildFoundPoiWarnings(pois, 50000, settings).warnings.find((warning) => warning.from === 'A' && warning.to === 'B');
  assert.ok(gap);
  assert.equal(gap.fromKind, 'poi');
  assert.equal(gap.toKind, 'poi');
  assert.equal(gap.fromPoiId, 'node/1');
  assert.equal(gap.toPoiId, 'way/2');
  assert.equal(gap.hasPreviousQualifyingPoi, true);
  assert.equal(gap.hasNextQualifyingPoi, true);
});
