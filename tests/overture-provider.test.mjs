import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildOverpassQuery } from '../poi-config.js';
import {
  extractOverpassBbox,
  overturePlaceToElement,
  resolveOvertureRules,
} from '../poi-provider-overture.js';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const proxy = fs.readFileSync(new URL('../api/places.php', import.meta.url), 'utf8');
const importer = fs.readFileSync(new URL('../scripts/update-overture-places.py', import.meta.url), 'utf8');

const category = (id, osm) => ({ id, osm });

test('default resupply categories can use local Overture data', () => {
  const query = buildOverpassQuery([
    category('supermarket', { anyOf: [{ shop: 'supermarket' }] }),
    category('fuel', { anyOf: [{ amenity: 'fuel' }] }),
    category('drinking_water', { anyOf: [{ amenity: 'drinking_water' }] }),
  ], [53.1, 7.2, 53.3, 7.5]);

  const rules = resolveOvertureRules(query);
  assert.deepEqual(rules.map((rule) => rule.id), ['supermarket', 'fuel', 'drinking_water']);
  assert.deepEqual(extractOverpassBbox(query), { south: 53.1, west: 7.2, north: 53.3, east: 7.5 });
});

test('provider-specific parcel lockers remain on the Overpass fallback', () => {
  const query = buildOverpassQuery([
    category('dhl_packstation', {
      allOf: [{ amenity: 'parcel_locker' }],
      providerAnyOf: [{ brand: 'DHL Packstation' }, { operator: 'DHL' }],
    }),
  ], [53.1, 7.2, 53.3, 7.5]);
  assert.equal(resolveOvertureRules(query), null);
});

test('local Overture rows become Overpass-shaped elements for existing projection logic', () => {
  const rules = resolveOvertureRules(buildOverpassQuery([
    category('supermarket', { anyOf: [{ shop: 'supermarket' }] }),
  ], [53.1, 7.2, 53.3, 7.5]));
  const element = overturePlaceToElement({
    id: '08f-test', name: 'Testmarkt', category: 'supermarket', lat: 53.2, lon: 7.4,
  }, rules);
  assert.deepEqual(element, {
    type: 'overture',
    id: '08f-test',
    lat: 53.2,
    lon: 7.4,
    tags: { shop: 'supermarket', name: 'Testmarkt', source: 'overture' },
  });
});

test('Overture bridge loads before the existing app module', () => {
  const providerIndex = index.indexOf("await import('./poi-provider-overture.js')");
  const appIndex = index.indexOf("await import('./app.js')");
  assert.ok(providerIndex >= 0);
  assert.ok(appIndex > providerIndex);
  assert.doesNotMatch(index, /geoapify/i);
});

test('production deploy uploads the local provider and API without a POI API secret', () => {
  assert.match(workflow, /put poi-provider-overture\.js/);
  assert.match(workflow, /put api\/places\.php api\/places\.php/);
  assert.doesNotMatch(workflow, /GEOAPIFY|geoapify/i);
});

test('local POI API uses SQLite RTree and bounded allowlisted queries', () => {
  assert.match(proxy, /\$allowedCategories = \[/);
  assert.match(proxy, /places_rtree/);
  assert.match(proxy, /PDO\('sqlite:'/);
  assert.match(proxy, /\(\$east - \$west\) > 1\.0/);
  assert.match(proxy, /LIMIT 5000/);
});

test('monthly importer uses Overture GeoParquet, new taxonomy fields and generated SQLite data', () => {
  assert.match(importer, /overturemaps-us-west-2\/release/);
  assert.match(importer, /basic_category/);
  assert.match(importer, /taxonomy/);
  assert.match(importer, /CREATE VIRTUAL TABLE places_rtree USING rtree/);
  assert.match(importer, /fetchmany\(10_000\)/);
});
