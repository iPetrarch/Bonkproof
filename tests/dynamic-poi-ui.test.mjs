import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const deploy = fs.readFileSync(new URL('../deploy.ps1', import.meta.url), 'utf8');
const config = JSON.parse(fs.readFileSync(new URL('../config/poi-categories.json', import.meta.url), 'utf8'));
const profile = JSON.parse(fs.readFileSync(new URL('../config/resupply-profile.json', import.meta.url), 'utf8'));

test('default POI categories are supermarket, fuel and drinking water only', () => {
  const enabled = config.categories.filter((category) => category.defaultEnabled).map((category) => category.id).sort();
  assert.deepEqual(enabled, ['drinking_water', 'fuel', 'supermarket']);
});

test('drinking water is reliable resupply alongside supermarket and fuel', () => {
  assert.deepEqual([...profile.reliableCategoryIds].sort(), ['drinking_water', 'fuel', 'supermarket']);
});

test('all configured categories are rendered dynamically and remain independently toggleable', () => {
  assert.match(index, /id="poi-categories" class="poi-categories" hidden><\/div>/);
  assert.match(app, /config\.categories\.forEach\(\(category\) =>/);
  assert.match(app, /data-category-toggle/);
  assert.match(app, /activeCategoryIds\.delete\(categoryId\)/);
  assert.match(app, /activeCategoryIds\.add\(categoryId\)/);
});

test('category radii are editable and feed the active Overpass search configuration', () => {
  assert.match(app, /data-category-radius/);
  assert.match(app, /categoryRadiusOverrides\.set\(categoryId, radiusM\)/);
  assert.match(app, /const queryCategoryIds = incremental \? new Set\(requestedCategoryIds\) : activeCategoryIds/);
  assert.match(app, /buildActiveCategories\(config, queryCategoryIds, categoryRadiusOverrides\)/);
  assert.match(app, /category\.radiusM \+ getGraceMeters\(category, config\)/);
  assert.match(app, /const hardLimitM = category\.radiusM/);
});

test('enabling a new category or changing an active radius refreshes the POI search', () => {
  assert.match(app, /if \(enabling && currentParsedRoute && !categoryIsLoaded\(categoryId\)\) \{\s*loadPois\(currentParsedRoute, true, false, \[categoryId\], \[categoryId\]\)/);
  assert.match(app, /loadedCategoryRadii\.delete\(categoryId\)[\s\S]*?if \(activeCategoryIds\.has\(categoryId\) && currentParsedRoute\) \{\s*loadPois\(currentParsedRoute, true, false, \[categoryId\], \[categoryId\]\)/);
});

test('supply warnings only use active reliable resupply categories', () => {
  assert.match(app, /activeFoundResupplyPois/);
  assert.match(app, /filterReliableResupplyPois\(visible, resupplyProfile\)/);
  assert.match(app, /filterReliableSelectedPoiIds\(currentPois, selectedPoiIds, resupplyProfile, poiKey\)/);
});

test('dynamic POI dependencies are included in deployment', () => {
  for (const file of ['poi-config.js', 'resupply-profile.js', 'config/resupply-profile.json']) {
    assert.match(deploy, new RegExp(file.replaceAll('.', '\\.'), 'm'));
  }
});

test('dynamic category controls have dedicated responsive styles', () => {
  assert.match(styles, /\.category-toggle/);
  assert.match(styles, /\.category-radius input/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.category-row \{ grid-template-columns: 1fr; \}/);
});
