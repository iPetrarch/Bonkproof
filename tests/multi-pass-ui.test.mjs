import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [app, deploy] = await Promise.all([
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../deploy.ps1', import.meta.url), 'utf8'),
]);

test('POI loading projects one physical OSM object into distinct pass-bys', () => {
  assert.match(app, /from '\.\/poi-projection\.js'/);
  assert.match(app, /projectPoiPassBys\(coordinate, geometry, softLimitM\)/);
  assert.match(app, /physicalPoiId: physicalId/);
  assert.match(app, /passId: projection\.passId/);
  assert.match(app, /const key = poiKey\(poi\)/);
  assert.doesNotMatch(app, /const key = `\$\{poi\.osmType\}\/\$\{poi\.osmId\}`/);
});

test('repeated pass-bys are independently selectable and navigable', () => {
  assert.match(app, /function nextPassBy\(poi\)/);
  assert.match(app, /function jumpToPassBy\(poi\)/);
  assert.match(app, /Nächste Vorbeifahrt · km/);
  assert.match(app, /Vorbeifahrt \$\{poi\.passIndex\}\/\$\{poi\.passCount\}/);
  assert.match(app, /toggleSelection\(poiId\)/);
  assert.match(app, /POI_LIST_PAGE_SIZE/);
});

test('the new projection module is included in the deployment publish set', () => {
  assert.match(deploy, /'poi-projection\.js'/);
});
