import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFoundPoiWarnings, buildRoutebookWarnings } from '../routebook.js';

const settings = {
  criticalDistanceKm: 30,
  infoPercent: 66,
  warningPercent: 80,
  criticalPercent: 95,
};

test('found-POI gaps expose route positions in metres and kilometres with a stable gap type', () => {
  const [gap] = buildFoundPoiWarnings([], 40000, settings).warnings;
  assert.equal(gap.gapType, 'resupply');
  assert.equal(gap.startMeters, 0);
  assert.equal(gap.endMeters, 40000);
  assert.equal(gap.startKm, 0);
  assert.equal(gap.endKm, 40);
  assert.equal(gap.lengthM, 40000);
});

test('routebook gaps expose the same metadata shape', () => {
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
});
