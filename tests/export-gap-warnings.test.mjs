import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCriticalGapExportPoints, routeCoordinateAtDistance } from '../export-gap-warnings.js';

function straightRoute(km) {
  return {
    segments: [[
      { lat: 0, lon: 0 },
      { lat: km / 111.195, lon: 0 },
    ]],
  };
}

test('disabled gap export produces no warning points', () => {
  const result = buildCriticalGapExportPoints({
    parsedRoute: straightRoute(100),
    pois: [],
    selectedPoiIds: new Set(),
    routeDistanceMeters: 100000,
    gapSettings: { criticalDistanceKm: 30, infoPercent: 66, warningPercent: 80, criticalPercent: 95 },
    enabled: false,
  });
  assert.deepEqual(result, []);
});

test('critical gaps are projected one metre before their actual route start', () => {
  const pois = [
    { osmType: 'node', osmId: 1, name: 'Stop A', routeKm: 20, offRouteM: 10 },
    { osmType: 'node', osmId: 2, name: 'Stop B', routeKm: 60, offRouteM: 10 },
  ];
  const selectedPoiIds = new Set(['node/1', 'node/2']);
  const result = buildCriticalGapExportPoints({
    parsedRoute: straightRoute(100),
    pois,
    selectedPoiIds,
    routeDistanceMeters: 100000,
    gapSettings: { criticalDistanceKm: 30, infoPercent: 66, warningPercent: 80, criticalPercent: 95 },
    enabled: true,
  });

  assert.equal(result.length, 2);
  assert.ok(Math.abs(result[0].routeKm - 19.999) < 0.002);
  assert.ok(Math.abs(result[1].routeKm - 59.999) < 0.002);
  assert.equal(result[0].exportOnly, true);
  assert.equal(result[0].selected, false);
  assert.equal(result[0].sourceIdentity.provider, 'bonkproof');
});

test('a critical start gap is projected exactly at route start', () => {
  const pois = [{ osmType: 'node', osmId: 1, name: 'Late stop', routeKm: 40, offRouteM: 10 }];
  const result = buildCriticalGapExportPoints({
    parsedRoute: straightRoute(50),
    pois,
    selectedPoiIds: new Set(['node/1']),
    routeDistanceMeters: 50000,
    gapSettings: { criticalDistanceKm: 30, infoPercent: 66, warningPercent: 80, criticalPercent: 95 },
    enabled: true,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].routeKm, 0);
  assert.equal(result[0].lat, 0);
  assert.equal(result[0].lon, 0);
});

test('warning coordinate follows cumulative route order across segments without air-line jumps', () => {
  const route = {
    segments: [
      [{ lat: 0, lon: 0 }, { lat: 0.1, lon: 0 }],
      [{ lat: 50, lon: 50 }, { lat: 50.1, lon: 50 }],
    ],
  };
  const firstLength = 11119.5;
  const point = routeCoordinateAtDistance(route, firstLength + 5000);
  assert.ok(point.lat > 50 && point.lat < 50.1);
  assert.ok(Math.abs(point.lon - 50) < 0.001);
});

test('current gap thresholds are honored when building export warnings', () => {
  const common = {
    parsedRoute: straightRoute(35),
    pois: [],
    selectedPoiIds: new Set(),
    routeDistanceMeters: 35000,
    enabled: true,
  };
  const strict = buildCriticalGapExportPoints({
    ...common,
    gapSettings: { criticalDistanceKm: 50, infoPercent: 66, warningPercent: 80, criticalPercent: 95 },
  });
  const permissive = buildCriticalGapExportPoints({
    ...common,
    gapSettings: { criticalDistanceKm: 30, infoPercent: 66, warningPercent: 80, criticalPercent: 95 },
  });
  assert.equal(strict.length, 0);
  assert.equal(permissive.length, 1);
});


test('gap export projection does not mutate POIs or selection state', () => {
  const pois = [{ osmType: 'node', osmId: 7, name: 'Stop', routeKm: 30, offRouteM: 5 }];
  const selectedPoiIds = new Set(['node/7']);
  const beforePois = structuredClone(pois);
  const beforeIds = [...selectedPoiIds];

  buildCriticalGapExportPoints({
    parsedRoute: straightRoute(80),
    pois,
    selectedPoiIds,
    routeDistanceMeters: 80000,
    gapSettings: { criticalDistanceKm: 30, infoPercent: 66, warningPercent: 80, criticalPercent: 95 },
    enabled: true,
  });

  assert.deepEqual(pois, beforePois);
  assert.deepEqual([...selectedPoiIds], beforeIds);
});
