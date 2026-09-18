import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildFoundPoiWarnings, buildRoutebook, buildRoutebookWarnings, extractRouteGeometryRange, poiKey, togglePoiSelection } from '../routebook.js';
import { buildPoiQuerySections, fetchPoiSectionWithRetry, isRetryablePoiStatus, paginatePois, retryAfterMilliseconds, splitPoiQuerySection } from '../poi-search.js';
import { clusterAccessibleLabel, clusterCategoryCounts, clusterPoiData, clusterRingStyle, POI_CLUSTER_DISABLE_ZOOM, POI_CLUSTER_RADIUS_PX } from '../poi-clustering.js';

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
  assert.match(app, /function renderRoute\(parsed, fileName, sourceGpxText\)[\s\S]*?dropZone\.hidden = true;/);
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


test('Export tab is route-gated and exposes GPX/TCX download controls', () => {
  assert.match(index, /id="export-tab"[^>]*disabled/);
  assert.match(index, /id="export-panel"[^>]*hidden/);
  assert.match(index, /id="export-target"/);
  assert.match(index, /id="export-format"/);
  assert.match(index, /id="export-download"[^>]*disabled/);
  assert.match(app, /exportTab\.disabled = false;/);
  assert.match(app, /exportTab\.disabled = true;/);
  assert.match(app, /const showExport = tab === 'export'/);
  assert.match(app, /exportPanel\.hidden = !showExport/);
});

test('Export UI explains route-only exports and reflects selected stop count', () => {
  assert.match(app, /No stops selected\. The route can still be exported without Bonkproof stop points\./);
  assert.match(app, /selectedCount > 0/);
  assert.match(app, /selected stop/);
  assert.match(app, /renderExportPanel\(\)/);
  assert.match(app, /toggleSelection\(poiId\)[\s\S]*?renderExportPanel\(\)/);
});

test('Export UI uses data-driven profiles and downloads the selected format', () => {
  assert.match(app, /EXPORT_TARGET_PROFILES\.forEach/);
  assert.match(app, /availableExportFormats\(profileId\)/);
  assert.match(app, /getExportProfile\(exportTarget\.value\)/);
  assert.match(app, /downloadCurrentRouteExport\(exportFormat\.value\)/);
  assert.match(app, /sanitizeExportBaseName\(currentRouteFileName \|\| currentParsedRoute\.name\)/);
});

test('a POI can be selected and removed through the shared selection state', () => {
  const id = poiKey(pois[0]);
  const selected = togglePoiSelection(new Set(), id);
  assert.deepEqual([...selected], [id]);
  assert.equal(togglePoiSelection(selected, id).size, 0);
});

test('list and marker popup both use the same selection action', () => {
  assert.match(app, /page\.items\.forEach\(\(poi\) => \{[\s\S]*?const poiId = poiKey\(poi\)[\s\S]*?\.poi-selection[\s\S]*?toggleSelection\(poiId\)/);
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

test('gaps over 30 km are marked and a new route resets the selection', () => {
  const routebook = buildRoutebook(pois, new Set([poiKey(pois[1])]), 100000);
  assert.equal(routebook.entries.at(-1).isLongGap, true);
  assert.match(app, /function renderRoute\(parsed, fileName, sourceGpxText\)[\s\S]*?selectedPoiIds = new Set\(\);/);
  assert.match(styles, /\.routebook-item\.long-gap/);
});

test('found and routebook warnings are distinct and use the fixed threshold', () => {
  const pois = [
    { osmType: 'node', osmId: 1, routeKm: 10, offRouteM: 20, name: 'A' },
    { osmType: 'node', osmId: 2, routeKm: 90, offRouteM: 20, name: 'B' },
  ];
  const result = buildRoutebookWarnings(pois, new Set(['node/1', 'node/2']), 150000);
  assert.deepEqual(result.warnings.map((warning) => [warning.from, warning.to, warning.lengthM]), [['A', 'B', 80000], ['B', 'Ziel', 60000]]);
  assert.equal(buildFoundPoiWarnings([], 30100).warnings.length, 1);
  assert.equal(buildFoundPoiWarnings([], 30000).warnings.length, 0);
  assert.equal(buildFoundPoiWarnings([{ ...pois[0], status: 'near-miss' }], 30100).warnings.length, 1);
  assert.equal(buildFoundPoiWarnings([{ ...pois[0], status: 'inside' }, { ...pois[1], status: 'inside' }], 150000).warnings.length, 2);
});

test('POI warning rendering suppresses incomplete physical gaps but keeps routebook warnings independent', () => {
  const renderer = app.match(/function renderWarnings\(\)[\s\S]*?\n  \}\n\n  function spiderfyCluster/)[0];
  assert.match(renderer, /poiSearchRunning/);
  assert.match(renderer, /poiSectionStatus\.failed\.size > 0/);
  assert.match(renderer, /Versorgungslücken werden geprüft/);
  assert.match(renderer, /Prüfung unvollständig/);
  assert.match(app, /buildFoundPoiWarnings\(activeFoundResupplyPois\(\), currentRouteDistanceMeters, gapSettings\)/);
  assert.match(app, /filterReliableSelectedPoiIds\(currentPois, selectedPoiIds, resupplyProfile, poiKey\)/);
  assert.match(app, /ohne gefundenen POI/);
  assert.doesNotMatch(app, /formatDistance\(warning\.lengthM\) without a selected stop/);
  assert.match(app, /activeTab === 'routebook'\s*\? buildRoutebookWarnings/);
});

test('gap severity controls update analysis dynamically and validate percentage order', () => {
  assert.match(index, /id="gap-critical-km"[^>]*value="30"/);
  assert.match(index, /id="gap-info-percent"[^>]*value="66"/);
  assert.match(index, /id="gap-warning-percent"[^>]*value="80"/);
  assert.match(index, /id="gap-critical-percent"[^>]*value="95"/);
  assert.match(app, /gapSettingInputs\.forEach\(\(input\) => input\.addEventListener\('input', applyGapSettingsFromInputs\)\)/);
  assert.match(app, /normalizeGapSettings\(\{[\s\S]*?criticalDistanceKm:[\s\S]*?infoPercent:[\s\S]*?warningPercent:[\s\S]*?criticalPercent:/);
  assert.match(app, /buildRoutebook\(currentPois, selectedPoiIds, currentRouteDistanceMeters, gapSettings\)/);
  assert.match(app, /severity-\$\{warning\.severity\}/);
  assert.match(styles, /\.warning-item\.severity-info/);
  assert.match(styles, /\.warning-item\.severity-warning/);
  assert.match(styles, /\.warning-item\.severity-critical/);
});

test('POI section status keeps partial retries incomplete and preserves successful results', () => {
  assert.match(app, /let poiSectionStatus = \{ total: 0, completed: 0, failed: new Set\(\), started: false \}/);
  assert.match(app, /const incomplete = poiSectionStatus\.started && \(poiSectionStatus\.failed\.size > 0 \|\| poiSectionStatus\.completed < poiSectionStatus\.total\)/);
  assert.match(app, /poiSectionStatus\.completed \+= 1/);
  assert.match(app, /poiSectionStatus\.failed\.add\(workload\.id\)/);
  assert.match(app, /const pinnedFallbacks = \[\.\.\.pinnedPoiSnapshots\.entries\(\)\]/);
  assert.match(app, /const deduped = new Map\(\[\.\.\.\(retryFailedOnly \|\| incremental \? currentPois : \[\]\)\.map/);
  assert.match(app, /loadPois\(currentParsedRoute, true, failedPoiSections\.length > 0\)/);
});

test('warning geometry follows the actual route points', () => {
  const geometry = extractRouteGeometryRange({ segments: [[{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }]] }, 0, 200000);
  assert.equal(geometry.length, 1);
  assert.ok(geometry[0].some(([lat, lon]) => lat === 0 && lon === 1));
});

test('warning geometry uses cumulative meters, interpolates boundaries and preserves route order', () => {
  const route = { segments: [[{ lat: 0, lon: 0 }, { lat: 0.5, lon: 0 }, { lat: 1, lon: 0 }, { lat: 1, lon: 1 }]] };
  const geometry = extractRouteGeometryRange(route, 78300, 110400);
  const points = geometry.flat();
  assert.equal(geometry.length, 1);
  assert.ok(points.length >= 2);
  assert.ok(Math.abs(points[0][0] - 0.704) < 0.01, `unexpected start ${points[0]}`);
  assert.ok(Math.abs(points.at(-1)[0] - 0.993) < 0.01, `unexpected end ${points.at(-1)}`);
  assert.equal(points[0][1], 0);
  assert.equal(points.at(-1)[1], 0);
});

test('warnings are integrated into POIs and Routebook without a third tab', () => {
  assert.doesNotMatch(index, /warnings-tab|warnings-panel/);
  assert.match(index, /id="poi-warning-summary"/);
  assert.match(app, /const warningLayer = L\.featureGroup\(\)\.addTo\(map\)/);
  assert.match(app, /buildFoundPoiWarnings/);
  assert.match(app, /buildRoutebookWarnings/);
  assert.match(app, /function renderWarningLayer\(\)/);
});

function routeOfKm(kilometres) {
  const points = Array.from({ length: Math.ceil(kilometres / 10) + 1 }, (_, index) => ({ lat: index * (10 / 111.2), lon: 0 }));
  return { segments: [points] };
}

test('POI query sections cover short, exact and long routes with overlap', () => {
  assert.equal(buildPoiQuerySections(routeOfKm(19)).length, 1);
  assert.equal(buildPoiQuerySections(routeOfKm(20)).length, 1);
  const longSections = buildPoiQuerySections(routeOfKm(234));
  assert.equal(longSections.length, 12);
  assert.ok(longSections[1].queryStartMeters < longSections[1].coreStartMeters);
  assert.ok(longSections[0].queryEndMeters > longSections[0].coreEndMeters);
});

test('adaptive section splitting is recursive, halves the core and preserves overlap', () => {
  const section = { index: 3, coreStartMeters: 100000, coreEndMeters: 120000, queryStartMeters: 99000, queryEndMeters: 121000, points: [{ lat: 1, lon: 1, routeMeters: 100000 }, { lat: 2, lon: 2, routeMeters: 110000 }, { lat: 3, lon: 3, routeMeters: 120000 }] };
  const parts = splitPoiQuerySection(section);
  assert.deepEqual(parts.map((part) => part.index), ['3.1', '3.2']);
  assert.equal(parts[0].coreEndMeters, 110000);
  assert.equal(parts[1].queryStartMeters, 109000);
  const nested = splitPoiQuerySection(parts[0]);
  assert.deepEqual(nested.map((part) => part.index), ['3.1.1', '3.1.2']);
  assert.equal(splitPoiQuerySection({ ...section, coreEndMeters: 102500 }).length, 0);
});

test('a repeated 504 adaptively splits workloads and replacements stay sequential', () => {
  assert.match(app, /Number\(error\?\.status\) === 504 \? splitPoiQueryWorkload\(workload\) : \[\]/);
  assert.match(app, /workloads\.splice\(workloadPosition \+ 1, 0, \.\.\.replacements\)/);
  assert.doesNotMatch(app, /Number\(error\?\.status\) === 429 \? splitPoiQueryWorkload/);
});

test('POI pagination covers zero, one, exact page, overflow and all 52 entries', () => {
  assert.doesNotMatch(app, /pois\.slice\(0, 30\)/);
  for (const count of [0, 1, 20, 21, 52]) {
    const items = Array.from({ length: count }, (_, index) => ({ routeKm: index }));
    const first = paginatePois(items, 1);
    assert.equal(first.totalPages, Math.max(1, Math.ceil(count / 20)));
    assert.ok(first.items.length <= 20);
    if (count > 20) assert.equal(paginatePois(items, first.totalPages).items.at(-1), items.at(-1));
  }
  assert.equal(paginatePois(Array.from({ length: 52 }, (_, index) => index), 1).endIndex, 20);
  assert.equal(paginatePois(Array.from({ length: 52 }, (_, index) => index), 3).startIndex, 40);
  assert.equal(paginatePois(Array.from({ length: 52 }, (_, index) => index), 4).page, 3);
});

test('workload requests are sequential and not parallel', () => {
  assert.match(app, /for \(let workloadPosition = 0; workloadPosition < workloads\.length/);
  assert.doesNotMatch(app, /Promise\.all\(workloads/);
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
  assert.match(app, /waitForPoiBackoff\(1000/);
  assert.match(app, /failedPoiSections\.length > 0/);
  assert.match(app, /if \(paceAfterWorkload && workloadPosition < workloads\.length - 1\) await waitForPoiBackoff\(1000/);
  assert.match(app, /paceAfterWorkload = candidates\.poiProvider !== 'overture-local'/);
  assert.match(app, /Overpass begrenzt derzeit die Anfragen/);
});

test('pagination and dynamic filters update locally while new searches are explicit', () => {
  assert.match(app, /poiNext\.addEventListener\('click', \(\) => \{[\s\S]*?renderPois\(currentPois, currentCategories\)/);
  assert.match(app, /const categoryId = button\.dataset\.categoryToggle/);
  assert.match(app, /if \(enabling\) activeCategoryIds\.add\(categoryId\);\s*else activeCategoryIds\.delete\(categoryId\);/);
  assert.match(app, /if \(enabling && currentParsedRoute && !categoryIsLoaded\(categoryId\)\)[\s\S]*?loadPois\(currentParsedRoute, true, false, \[categoryId\], \[categoryId\]\)/);
  assert.match(app, /defaultEnabledCategoryIds\(config\)/);
  assert.match(app, /selectedPoiIds\.has\(poiKey\(poi\)\)/);
  assert.match(app, /const mapPois = visiblePois\.concat\(currentPois\.filter/);
  assert.match(index, /id="poi-categories" class="poi-categories" hidden><\/div>/);
  assert.match(app, /Keine POI-Kategorie ausgewählt/);
});

const clusterPois = [
  { lat: 0, lon: 0, category: { id: 'supermarket' } },
  { lat: 0, lon: 0.0001, category: { id: 'fuel' } },
  { lat: 10, lon: 10, category: { id: 'supermarket' } },
];

test('screen-distance clustering groups nearby POIs and leaves distant POIs separate', () => {
  const clusters = clusterPoiData(clusterPois, (poi) => ({ x: poi.lon * 100, y: poi.lat * 100 }), POI_CLUSTER_RADIUS_PX);
  assert.equal(clusters.length, 2);
  assert.equal(clusters.find((cluster) => cluster.isCluster).items.length, 2);
  assert.equal(clusters.find((cluster) => !cluster.isCluster).items.length, 1);
});

test('cluster data supports category rings, accessible labels and unknown fallback', () => {
  const mixed = clusterPoiData(clusterPois.slice(0, 2), () => ({ x: 10, y: 10 }))[0];
  assert.deepEqual(clusterCategoryCounts(mixed.items), { supermarket: 1, fuel: 1 });
  assert.match(clusterRingStyle(mixed.items).background, /conic-gradient/);
  assert.match(clusterAccessibleLabel(mixed.items), /2 POIs: 1 Supermärkte, 1 Tankstellen/);
  const unknown = [{ lat: 0, lon: 0, category: { id: 'future' } }];
  assert.match(clusterRingStyle(unknown).background, /#7a8085/);
  assert.match(clusterAccessibleLabel(unknown), /Weitere POIs/);
});

test('selected POIs stay outside clusters and route layers do not use cluster rendering', () => {
  assert.match(app, /const selected = mapPois\.filter/);
  assert.match(app, /const clusterable = mapPois\.filter\(\(poi\) => !selectedPoiIds\.has/);
  assert.match(app, /poiLayer\.clearLayers\(\)/);
  assert.match(app, /POI_CLUSTER_DISABLE_ZOOM/);
  const mapRenderer = app.match(/function renderMapPois\(\)[\s\S]*?\n  \}\n\n  function renderPois/)[0];
  assert.doesNotMatch(mapRenderer, /routeLayer/);
});

test('Routebook tab renders only selected POIs without changing map view or querying Overpass', () => {
  assert.match(app, /let activeTab = 'pois'/);
  assert.match(app, /if \(activeTab === 'routebook'\)[\s\S]*?selectedPoiIds\.has\(poiKey\(poi\)\)/);
  assert.match(app, /setActiveTab\(tab\)[\s\S]*?renderMapPois\(\)/);
  assert.doesNotMatch(app.match(/function setActiveTab\(tab\)[\s\S]*?\n  \}/)[0], /loadPois|fitBounds/);
  assert.match(app, /function toggleSelection\(poiId\)[\s\S]*?renderMapPois|renderPois/);
});
