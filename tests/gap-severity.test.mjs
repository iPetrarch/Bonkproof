import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_GAP_SETTINGS,
  buildFoundPoiWarnings,
  buildGapThresholds,
  buildRoutebookWarnings,
  classifyGapMeters,
  normalizeGapSettings,
  poiKey,
} from '../routebook.js';

test('default gap profile derives info, warning and critical thresholds from 30 km', () => {
  const thresholds = buildGapThresholds();
  assert.equal(thresholds.referenceM, 30000);
  assert.equal(thresholds.infoM, 19800);
  assert.equal(thresholds.warningM, 24000);
  assert.equal(thresholds.criticalM, 28500);
});

test('severity boundaries are strict greater-than comparisons', () => {
  assert.equal(classifyGapMeters(19800), null);
  assert.equal(classifyGapMeters(19801), 'info');
  assert.equal(classifyGapMeters(24000), 'info');
  assert.equal(classifyGapMeters(24001), 'warning');
  assert.equal(classifyGapMeters(28500), 'warning');
  assert.equal(classifyGapMeters(28501), 'critical');
});

test('user-defined distance and percentages dynamically change all thresholds', () => {
  const settings = { criticalDistanceKm: 40, infoPercent: 50, warningPercent: 75, criticalPercent: 90 };
  const thresholds = buildGapThresholds(settings);
  assert.equal(thresholds.infoM, 20000);
  assert.equal(thresholds.warningM, 30000);
  assert.equal(thresholds.criticalM, 36000);
  assert.equal(classifyGapMeters(25000, settings), 'info');
  assert.equal(classifyGapMeters(32000, settings), 'warning');
  assert.equal(classifyGapMeters(37000, settings), 'critical');
});

test('invalid percentage order is rejected instead of producing contradictory severities', () => {
  assert.throws(() => normalizeGapSettings({ ...DEFAULT_GAP_SETTINGS, infoPercent: 85, warningPercent: 80 }), /Info < Warning < Critical/);
  assert.throws(() => normalizeGapSettings({ ...DEFAULT_GAP_SETTINGS, criticalPercent: 101 }), /at most 100/);
  assert.throws(() => normalizeGapSettings({ ...DEFAULT_GAP_SETTINGS, criticalDistanceKm: 0 }), /greater than 0/);
});

test('found-POI and routebook warnings use the same dynamic severity profile', () => {
  const settings = { criticalDistanceKm: 30, infoPercent: 66, warningPercent: 80, criticalPercent: 95 };
  const pois = [
    { osmType: 'node', osmId: 1, routeKm: 20, offRouteM: 10, status: 'inside', name: 'A' },
    { osmType: 'node', osmId: 2, routeKm: 45, offRouteM: 10, status: 'inside', name: 'B' },
  ];
  const selected = new Set(pois.map(poiKey));
  const found = buildFoundPoiWarnings(pois, 80000, settings);
  const routebook = buildRoutebookWarnings(pois, selected, 80000, settings);
  assert.deepEqual(found.warnings.map((gap) => gap.severity), ['info', 'warning', 'critical']);
  assert.deepEqual(routebook.warnings.map((gap) => gap.severity), ['info', 'warning', 'critical']);
});
