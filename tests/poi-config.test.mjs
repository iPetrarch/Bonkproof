import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildActiveCategories,
  buildOverpassQuery,
  categoryMatchesTags,
  categoryQueryStatements,
  defaultCategoryRadii,
  defaultEnabledCategoryIds,
  getGraceMeters,
} from '../poi-config.js';

const config = JSON.parse(await readFile(new URL('../config/poi-categories.json', import.meta.url), 'utf8'));

test('default POI category state comes from configuration', () => {
  const enabled = defaultEnabledCategoryIds(config);
  assert.equal(enabled.has('supermarket'), true);
  assert.equal(enabled.has('fuel'), true);
  assert.equal(enabled.has('drinking_water'), true);
  assert.equal(enabled.has('restaurant'), false);
  const radii = defaultCategoryRadii(config);
  assert.equal(radii.get('supermarket'), 250);
  assert.equal(radii.get('bicycle_shop'), 2000);
});

test('active categories preserve config and accept per-category radius overrides', () => {
  const enabled = new Set(['supermarket', 'fuel']);
  const overrides = new Map([['supermarket', 600]]);
  const active = buildActiveCategories(config, enabled, overrides);
  assert.deepEqual(active.map((category) => [category.id, category.radiusM]), [['supermarket', 600], ['fuel', 250]]);
  assert.equal(active[0].defaultRadiusM, 250);
});

test('soft edge is derived from the effective category radius', () => {
  const supermarket = buildActiveCategories(config, new Set(['supermarket']), new Map([['supermarket', 1000]]))[0];
  assert.equal(getGraceMeters(supermarket, config), 100);
  const hospital = buildActiveCategories(config, new Set(['hospital']), new Map([['hospital', 10000]]))[0];
  assert.equal(getGraceMeters(hospital, config), 250, 'grace remains capped');
});

test('tag matching supports anyOf categories', () => {
  const supermarket = config.categories.find((category) => category.id === 'supermarket');
  assert.equal(categoryMatchesTags(supermarket, { shop: 'supermarket' }), true);
  assert.equal(categoryMatchesTags(supermarket, { shop: 'bakery' }), false);
});

test('tag matching supports allOf plus providerAnyOf categories', () => {
  const dhl = config.categories.find((category) => category.id === 'dhl_packstation');
  assert.equal(categoryMatchesTags(dhl, { amenity: 'parcel_locker', operator: 'DHL' }), true);
  assert.equal(categoryMatchesTags(dhl, { amenity: 'parcel_locker', brand: 'DHL Packstation' }), true);
  assert.equal(categoryMatchesTags(dhl, { amenity: 'parcel_locker', operator: 'Amazon' }), false);
  assert.equal(categoryMatchesTags(dhl, { operator: 'DHL' }), false);
});

test('Overpass statements cover simple and provider-specific config shapes', () => {
  const bbox = [53, 7, 54, 8];
  const supermarket = config.categories.find((category) => category.id === 'supermarket');
  assert.deepEqual(categoryQueryStatements(supermarket, bbox), ['nwr["shop"="supermarket"](53,7,54,8);']);

  const dhl = config.categories.find((category) => category.id === 'dhl_packstation');
  const statements = categoryQueryStatements(dhl, bbox);
  assert.equal(statements.length, 2);
  assert.ok(statements.some((statement) => statement.includes('["amenity"="parcel_locker"]["operator"="DHL"]')));
  assert.ok(statements.some((statement) => statement.includes('["amenity"="parcel_locker"]["brand"="DHL Packstation"]')));

  const query = buildOverpassQuery([supermarket, dhl], bbox);
  assert.match(query, /^\[out:json\]\[timeout:30\];\(/);
  assert.match(query, /out center tags;$/);
});
