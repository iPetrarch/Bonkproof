import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildFoundPoiWarnings, poiKey } from '../routebook.js';
import {
  filterReliableResupplyPois,
  filterReliableSelectedPoiIds,
  foundResupplyPois,
  isReliableResupplyPoi,
  reliableResupplyCategoryIds,
} from '../resupply-profile.js';

const profile = JSON.parse(await readFile(new URL('../config/resupply-profile.json', import.meta.url), 'utf8'));
const pois = [
  { osmType: 'node', osmId: 1, category: { id: 'supermarket' }, routeKm: 10 },
  { osmType: 'node', osmId: 2, category: { id: 'fuel' }, routeKm: 20 },
  { osmType: 'node', osmId: 3, category: { id: 'drinking_water' }, routeKm: 25 },
  { osmType: 'node', osmId: 4, category: { id: 'toilets' }, routeKm: 30 },
  { osmType: 'node', osmId: 5, category: { id: 'railway' }, routeKm: 40 },
  { osmType: 'node', osmId: 6, category: { id: 'cemetery' }, routeKm: 50 },
];

test('default resupply profile uses supermarket, fuel and drinking water', () => {
  assert.deepEqual([...reliableResupplyCategoryIds(profile)], ['supermarket', 'fuel', 'drinking_water']);
  assert.equal(isReliableResupplyPoi(pois[0], profile), true);
  assert.equal(isReliableResupplyPoi(pois[1], profile), true);
  assert.equal(isReliableResupplyPoi(pois[2], profile), true);
  assert.equal(isReliableResupplyPoi(pois[3], profile), false);
});

test('non-resupply POIs cannot silently close a supply gap', () => {
  assert.deepEqual(filterReliableResupplyPois(pois, profile).map((poi) => poi.category.id), ['supermarket', 'fuel', 'drinking_water']);
});

test('routebook selection can be reduced to reliable resupply stops without losing general selections', () => {
  const selected = new Set(pois.map(poiKey));
  const reliableSelected = filterReliableSelectedPoiIds(pois, selected, profile, poiKey);
  assert.deepEqual([...reliableSelected], ['node/1', 'node/2', 'node/3']);
  assert.equal(selected.size, 6, 'general Routebook selection remains untouched');
});

test('profile can later be expanded without changing route analysis code', () => {
  const custom = { reliableCategoryIds: ['supermarket', 'fuel', 'drinking_water', 'bakery'] };
  assert.equal(isReliableResupplyPoi({ category: { id: 'bakery' } }, custom), true);
});

test('global radius changes requalify cached hits and scoped matches independently close gaps', () => {
  const cached = { ...pois[0], name: 'Market', routeKm: 40, offRouteM: 400, status: 'near-miss' };
  const retained = { ...pois[1], offRouteM: 0, status: 'retained' };
  const pinned = { ...pois[2], offRouteM: 0, status: 'pinned' };
  const scoped = { ...cached, name: 'Scoped', osmId: 9, routeKm: 70, scoped: true };
  const enabled = new Set(['supermarket', 'fuel', 'drinking_water']);
  const warnings = (radius, accepted = []) => buildFoundPoiWarnings(
    foundResupplyPois([cached, retained, pinned, ...accepted], accepted, enabled, () => radius, profile, poiKey),
    100_000,
  );
  assert.equal(warnings(200).longestGapM, 100_000);
  assert.equal(warnings(500).longestGapM, 60_000);
  assert.equal(warnings(500, [scoped]).foundCount, 1, 'scoped near miss cannot use the global radius');
  assert.equal(warnings(200, [{ ...scoped, status: 'match' }]).longestGapM, 70_000);
  assert.equal(warnings(500, [{ ...cached, scoped: true, status: 'match' }]).foundCount, 1);
  enabled.delete('supermarket');
  assert.equal(warnings(500).foundCount, 0);
  assert.equal(warnings(500, [{ ...scoped, status: 'match' }]).foundCount, 1);
});
