import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryRadiusIsLoaded, effectivePoiState, poiInsideEffectiveCorridor } from '../poi-config.js';

const config = {
  categories: [
    { id: 'supermarket', defaultRadiusM: 250 },
    { id: 'hospital', defaultRadiusM: 5000 },
  ],
};

test('ICE overlays enabled categories and radii without mutating normal state', () => {
  const enabled = new Set(['supermarket']);
  const radii = new Map([['supermarket', 300], ['hospital', 7000]]);
  const state = effectivePoiState(config, enabled, radii, { radiusOverridesM: { supermarket: 2000, hospital: 10000 } });
  assert.deepEqual([...enabled], ['supermarket']);
  assert.equal(radii.get('supermarket'), 300);
  assert.equal(state.enabledIds.has('hospital'), true);
  assert.equal(state.radiusOverrides.get('supermarket'), 2000);
  assert.equal(state.radiusOverrides.get('hospital'), 10000);
});

test('ICE never shrinks a larger user radius and disabling restores normal values', () => {
  const enabled = new Set(['hospital']);
  const radii = new Map([['hospital', 12000]]);
  assert.equal(effectivePoiState(config, enabled, radii, { radiusOverridesM: { hospital: 10000 } }).radiusOverrides.get('hospital'), 12000);
  const normal = effectivePoiState(config, enabled, radii, null);
  assert.equal(normal.radiusOverrides.get('hospital'), 12000);
  assert.deepEqual([...normal.enabledIds], ['hospital']);
});

test('larger loaded coverage satisfies a smaller radius and corridor filtering shrinks locally', () => {
  assert.equal(categoryRadiusIsLoaded(10000, 5000), true);
  assert.equal(categoryRadiusIsLoaded(3000, 5000), false);
  assert.equal(poiInsideEffectiveCorridor({ offRouteM: 5400 }, 5000, 500), true);
  assert.equal(poiInsideEffectiveCorridor({ offRouteM: 5600 }, 5000, 500), false);
});
