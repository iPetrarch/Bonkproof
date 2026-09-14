import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildRoutebook, poiKey, togglePoiSelection } from '../routebook.js';
import { buildPoiQuerySections, fetchPoiSectionWithRetry, isRetryablePoiStatus, retryAfterMilliseconds } from '../poi-search.js';

const [rawApp, rawStyles, rawDeploy, rawIndex] = await Promise.all([
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../deploy.ps1', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
]);
const app = rawApp.replaceAll('\r\n', '\n');
const styles = rawStyles.replaceAll('\r\n', '\n');
const deploy = rawDeploy.replaceAll('\r\n', '\n');
const index = rawIndex.replaceAll('\r\n', '\n');

test('a rendered route hides the GPX import overlay', () => {
  assert.match(app, /function renderRoute\(parsed, fileName\)[\s\S]*?dropZone\.hidden = true;/);
  assert.match(styles, /\.empty-state\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
});

test('invalid GPX files keep the import overlay available while reporting an error', () => {
  const loadFile = app.match(/async function loadFile\(file\) \{([\s\S]*?)\n  \}\n\n  fileInput\.addEventListener/);
  assert.ok(loadFile, 'loadFile implementation should be present');
  assert.match(loadFile[1], /catch \(error\) \{[\s\S]*?showError\(/);
  assert.doesNotMatch(loadFile[1], /dropZone\.hidden\s*=\s*true/);
});

test('the title starts to the right of the Leaflet zoom control', () => {
  assert.match(styles, /\.topbar > div\s*\{[\s\S]*?margin-left:\s*2\.5rem;/);
});

test('every productive local JavaScript import is whitelisted for deployment', () => {
  const localImports = [...app.matchAll(/from\s+['"](\.\/[^'"]+\.js)['"]/g)].map((match) => match[1].slice(2));
  assert.ok(localImports.length > 0, 'app should have a local JavaScript import to check');
  localImports.forEach((file) => assert.match(deploy, new RegExp(`'${file.replace('.', '\\.')}'(?:,|\\s)`)));
  assert.match(deploy, /function Assert-LocalJavaScriptImportsPublished/);
});

const pois = [
  { osmType: 'node', osmId: 1, name: 'Late stop', routeKm: 82, offRouteM: 20, category: { label: 'Supermarket' } },
  { osmType: 'node', osmId: 2, name: 'Early stop', routeKm: 25, offRouteM: 10, category: { label: 'Fuel station' } },
];

test('a POI can be selected and removed through the shared selection state', () => {
  const id = poiKey(pois[0]);
  const selected = togglePoiSelection(new Set(), id);
  assert.deepEqual([...selected], [id]);
  assert.equal(togglePoiSelection(selected, id).size, 0);
});

test('list and marker popup both use the same selection action', () => {
  assert.match(app, /\.poi-selection.*?toggleSelection\(poiKey\(poi\)\)/s);
  assert.match(app, /popup-selection[\s\S]*?toggleSelection\(poiId\)/);
});

test('routebook sorts stops and calculates every supply gap', () => {
  const routebook = buildRoutebook(pois, new Set(pois.map(poiKey)), 100000);
  assert.deepEqual(routebook.stops.map((poi) => poi.name), ['Early stop', 'Late stop']);
  assert.deepEqual(routebook.entries.map((entry) => entry.distanceFromPreviousM), [0, 25000, 57000, 18000]);
  assert.equal(routebook.longestGapM, 57000);
});

test('an empty routebook treats the complete route as its longest gap', () => {
  const routebook = buildRoutebook(pois, new Set(), 75000);
  assert.equal(routebook.stops.length, 0);
  assert.equal(routebook.longestGapM, 75000);
});

test('gaps over 60 km are marked and a new route resets the selection', () => {
  const routebook = buildRoutebook(pois, new Set([poiKey(pois[1])]), 100000);
  assert.equal(routebook.entries.at(-1).isLongGap, true);
  assert.match(app, /function renderRoute\(parsed, fileName\)[\s\S]*?selectedPoiIds = new Set\(\);/);
  assert.match(styles, /\.routebook-item\.long-gap/);
});

function routeOfKm(kilometres) {
  const points = Array.from({ length: Math.ceil(kilometres / 10) + 1 }, (_, index) => ({ lat: index * (10 / 111.2), lon: 0 }));
  return { segments: [points] };
}

test('POI query sections cover short, exact and long routes with overlap', () => {
  assert.equal(buildPoiQuerySections(routeOfKm(49)).length, 1);
  assert.equal(buildPoiQuerySections(routeOfKm(50)).length, 1);
  const longSections = buildPoiQuerySections(routeOfKm(234));
  assert.equal(longSections.length, 5);
  assert.ok(longSections[1].queryStartMeters < longSections[1].coreStartMeters);
  assert.ok(longSections[0].queryEndMeters > longSections[0].coreEndMeters);
});

test('section requests are sequential and not parallel', () => {
  assert.match(app, /for \(const section of sections\)/);
  assert.doesNotMatch(app, /Promise\.all\(sections/);
});

test('retry handles one transient gateway failure only', async () => {
  let calls = 0;
  const result = await fetchPoiSectionWithRetry(async () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error('gateway timeout'), { status: 504 });
    return ['ok'];
  }, {}, { wait: 0 });
  assert.deepEqual(result, ['ok']);
  assert.equal(calls, 2);
  assert.equal(isRetryablePoiStatus(502), true);
  assert.equal(isRetryablePoiStatus(503), true);
  assert.equal(isRetryablePoiStatus(504), true);
  assert.equal(isRetryablePoiStatus(500), false);
});

test('429 Retry-After supports seconds, dates and the 30 second fallback', () => {
  assert.equal(retryAfterMilliseconds('12'), 12000);
  assert.equal(retryAfterMilliseconds('invalid', 30000), 30000);
  assert.equal(retryAfterMilliseconds(new Date(11000).toUTCString(), 30000, 10000), 1000);
});

test('non-transient errors and repeated transient errors are not retried', async () => {
  let calls = 0;
  await assert.rejects(() => fetchPoiSectionWithRetry(async () => {
    calls += 1;
    throw Object.assign(new Error('bad request'), { status: 400 });
  }, {}, { wait: 0 }));
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(() => fetchPoiSectionWithRetry(async () => {
    calls += 1;
    throw Object.assign(new Error('still unavailable'), { status: 503 });
  }, {}, { wait: 0 }));
  assert.equal(calls, 2);
});

test('reload is disabled before a route, preserves IDs and prevents parallel searches', () => {
  assert.match(index, /id="reload-pois"[^>]*disabled/);
  assert.match(app, /if \(poiSearchRunning\) return;/);
  assert.match(app, /loadPois\(currentParsedRoute, true, failedPoiSections\.length > 0\)/);
  assert.match(app, /selectedPoiIds = new Set\(\[\.\.\.selectedPoiIds\].*poiKey\(poi\)/s);
  assert.match(app, /waitForPoiBackoff\(2500/);
  assert.match(app, /failedPoiSections\.length > 0/);
  assert.match(app, /if \(section\.index !== sections\.at\(-1\)\?\.index\)/);
  assert.match(app, /Overpass begrenzt derzeit die Anfragen/);
});
