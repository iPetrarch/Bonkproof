import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildOverpassQuery } from '../poi-config.js';
import {
  extractOverpassBbox,
  geoapifyFeatureToElement,
  resolveGeoapifyRules,
} from '../poi-provider-geoapify.js';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const deployWorkflow = fs.readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const proxy = fs.readFileSync(new URL('../api/places.php', import.meta.url), 'utf8');

const category = (id, osm) => ({ id, osm });

test('default resupply categories can use Geoapify', () => {
  const query = buildOverpassQuery([
    category('supermarket', { anyOf: [{ shop: 'supermarket' }] }),
    category('fuel', { anyOf: [{ amenity: 'fuel' }] }),
    category('drinking_water', { anyOf: [{ amenity: 'drinking_water' }] }),
  ], [53.1, 7.2, 53.3, 7.5]);

  const rules = resolveGeoapifyRules(query);
  assert.deepEqual(rules.map((rule) => rule.id), ['supermarket', 'fuel', 'drinking_water']);
  assert.deepEqual(extractOverpassBbox(query), { south: 53.1, west: 7.2, north: 53.3, east: 7.5 });
});

test('provider-specific parcel lockers stay on the Overpass fallback', () => {
  const query = buildOverpassQuery([
    category('dhl_packstation', {
      allOf: [{ amenity: 'parcel_locker' }],
      providerAnyOf: [{ brand: 'DHL Packstation' }, { operator: 'DHL' }],
    }),
  ], [53.1, 7.2, 53.3, 7.5]);
  assert.equal(resolveGeoapifyRules(query), null);
});

test('Geoapify features become Overpass-shaped elements for existing projection logic', () => {
  const rules = resolveGeoapifyRules(buildOverpassQuery([
    category('supermarket', { anyOf: [{ shop: 'supermarket' }] }),
  ], [53.1, 7.2, 53.3, 7.5]));
  const element = geoapifyFeatureToElement({
    geometry: { type: 'Point', coordinates: [7.4, 53.2] },
    properties: {
      place_id: 'test-place',
      name: 'Testmarkt',
      categories: ['commercial.supermarket'],
    },
  }, rules);
  assert.deepEqual(element, {
    type: 'geoapify',
    id: 'test-place',
    lat: 53.2,
    lon: 7.4,
    tags: { shop: 'supermarket', name: 'Testmarkt', source: 'geoapify' },
  });
});

test('Geoapify bridge loads before the existing app module', () => {
  const providerIndex = index.indexOf("await import('./poi-provider-geoapify.js')");
  const appIndex = index.indexOf("await import('./app.js')");
  assert.ok(providerIndex >= 0);
  assert.ok(appIndex > providerIndex);
});

test('production deploy uploads provider, proxy and generated secret config', () => {
  assert.match(deployWorkflow, /put poi-provider-geoapify\.js/);
  assert.match(deployWorkflow, /put api\/places\.php api\/places\.php/);
  assert.match(deployWorkflow, /secrets\.BONKPROOF_GEOAPIFY_API_KEY/);
  assert.match(deployWorkflow, /put api\/\.geoapify-key\.php api\/\.geoapify-key\.php/);
  assert.doesNotMatch(deployWorkflow, /apiKey=[A-Za-z0-9_-]{20,}/);
});

test('Geoapify proxy only forwards allowlisted categories and bounded rectangles', () => {
  assert.match(proxy, /\$allowedCategories = \[/);
  assert.match(proxy, /in_array\(\$category, \$allowedCategories, true\)/);
  assert.match(proxy, /\(\$east - \$west\) > 1\.0/);
  assert.match(proxy, /CURLOPT_TIMEOUT => 15/);
  assert.match(proxy, /'limit' => 500/);
});
