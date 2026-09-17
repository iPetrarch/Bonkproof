from pathlib import Path


def replace_once(text: str, old: str, new: str) -> str:
    if old not in text:
        raise SystemExit(f'Expected snippet not found:\n{old}')
    return text.replace(old, new, 1)


app_path = Path('app.js')
app = app_path.read_text(encoding='utf-8')

app = replace_once(
    app,
    "  let activeCategoryIds = new Set(INITIAL_CATEGORY_IDS);\n",
    "  let activeCategoryIds = new Set(INITIAL_CATEGORY_IDS);\n  let loadedCategoryRadii = new Map();\n",
)
app = replace_once(
    app,
    "    activeCategoryIds = poiConfig ? defaultEnabledCategoryIds(poiConfig) : new Set(INITIAL_CATEGORY_IDS);\n    categoryRadiusOverrides = poiConfig ? defaultCategoryRadii(poiConfig) : new Map();\n",
    "    activeCategoryIds = poiConfig ? defaultEnabledCategoryIds(poiConfig) : new Set(INITIAL_CATEGORY_IDS);\n    categoryRadiusOverrides = poiConfig ? defaultCategoryRadii(poiConfig) : new Map();\n    loadedCategoryRadii = new Map();\n",
)
app = replace_once(
    app,
    "  async function fetchOsmCandidates(categories, section, config, signal) {\n",
    "  function categoryRadiusMeters(categoryId) {\n    const configured = poiConfig?.categories.find((category) => category.id === categoryId);\n    return Number(categoryRadiusOverrides.get(categoryId) ?? configured?.defaultRadiusM ?? 0);\n  }\n\n  function categoryIsLoaded(categoryId) {\n    const radiusM = categoryRadiusMeters(categoryId);\n    return Number.isFinite(radiusM) && loadedCategoryRadii.get(categoryId) === radiusM;\n  }\n\n  async function fetchOsmCandidates(categories, section, config, signal) {\n",
)
app = replace_once(
    app,
    "    const payload = await response.json();\n    return Array.isArray(payload.elements) ? payload.elements : [];\n",
    "    const payload = await response.json();\n    const elements = Array.isArray(payload.elements) ? payload.elements : [];\n    Object.defineProperty(elements, 'poiProvider', {\n      value: response.headers.get('X-Bonkproof-Poi-Provider') || 'overpass',\n      enumerable: false,\n    });\n    return elements;\n",
)
app = replace_once(
    app,
    "  async function loadPois(parsed, preserveSelection = false, retryFailedOnly = false) {\n",
    "  async function loadPois(parsed, preserveSelection = false, retryFailedOnly = false, requestedCategoryIds = null, replaceCategoryIds = null) {\n",
)
app = replace_once(
    app,
    "    if (!retryFailedOnly) clearPoiUi();\n",
    "    const incremental = Array.isArray(requestedCategoryIds) && requestedCategoryIds.length > 0;\n    if (!retryFailedOnly && !incremental) clearPoiUi();\n",
)
app = replace_once(
    app,
    "      const categories = buildActiveCategories(config, activeCategoryIds, categoryRadiusOverrides);\n",
    "      const queryCategoryIds = incremental ? new Set(requestedCategoryIds) : activeCategoryIds;\n      const categories = buildActiveCategories(config, queryCategoryIds, categoryRadiusOverrides);\n",
)
app = replace_once(
    app,
    "      const geometry = buildRouteGeometry(parsed);\n      const pinnedFallbacks = [...pinnedPoiSnapshots.entries()].map(([id, poi]) => [id, { ...poi, status: 'pinned' }]);\n      const deduped = new Map([...(retryFailedOnly ? currentPois : []).map((poi) => [poiKey(poi), poi]), ...pinnedFallbacks]);\n      const workloads = retryFailedOnly\n",
    "      const geometry = buildRouteGeometry(parsed);\n      const pinnedFallbacks = [...pinnedPoiSnapshots.entries()].map(([id, poi]) => [id, { ...poi, status: 'pinned' }]);\n      const replacedIds = new Set(replaceCategoryIds || []);\n      const previousUnrelatedFailures = incremental\n        ? failedPoiSections.filter((workload) => !workload.categories.some((category) => queryCategoryIds.has(category.id)))\n        : [];\n      const deduped = new Map([...(retryFailedOnly || incremental ? currentPois : []).map((poi) => [poiKey(poi), poi]), ...pinnedFallbacks]);\n      const freshQueriedPois = new Map();\n      const workloads = retryFailedOnly\n",
)
app = replace_once(
    app,
    "        const workloadCategories = workload.categories;\n        if (signal.aborted) return;\n",
    "        const workloadCategories = workload.categories;\n        let paceAfterWorkload = true;\n        if (signal.aborted) return;\n",
)
app = replace_once(
    app,
    "          if (!candidates) return;\n          candidates.forEach((element) => {\n            normalizePoiPassBys(element, workloadCategories, geometry, config).forEach((poi) => {\n              const key = poiKey(poi);\n              const existing = deduped.get(key);\n              if (!existing || existing.status === 'pinned' || poi.offRouteM < existing.offRouteM) {\n                deduped.set(key, poi);\n                if (pinnedPoiIds.has(key)) pinnedPoiSnapshots.set(key, { ...poi });\n              }\n            });\n          });\n",
    "          if (!candidates) return;\n          paceAfterWorkload = candidates.poiProvider !== 'overture-local';\n          candidates.forEach((element) => {\n            normalizePoiPassBys(element, workloadCategories, geometry, config).forEach((poi) => {\n              const key = poiKey(poi);\n              const freshExisting = freshQueriedPois.get(key);\n              if (!freshExisting || poi.offRouteM < freshExisting.offRouteM) freshQueriedPois.set(key, poi);\n              const existing = deduped.get(key);\n              if (incremental || !existing || existing.status === 'pinned' || poi.offRouteM < existing.offRouteM) {\n                deduped.set(key, poi);\n                if (pinnedPoiIds.has(key)) pinnedPoiSnapshots.set(key, { ...poi });\n              }\n            });\n          });\n",
)
app = replace_once(
    app,
    "        if (workloadPosition < workloads.length - 1) await waitForPoiBackoff(1000, section, signal);\n",
    "        if (paceAfterWorkload && workloadPosition < workloads.length - 1) await waitForPoiBackoff(1000, section, signal);\n",
)
app = replace_once(
    app,
    "      const pois = Array.from(deduped.values()).sort((a, b) => a.routeKm - b.routeKm || a.offRouteM - b.offRouteM);\n",
    "      let finalPois = deduped;\n      if (incremental && replacedIds.size > 0 && failedWorkloads.length === 0) {\n        finalPois = new Map(currentPois\n          .filter((poi) => !replacedIds.has(poi.category.id))\n          .map((poi) => [poiKey(poi), poi]));\n        pinnedFallbacks.forEach(([id, poi]) => finalPois.set(id, poi));\n        freshQueriedPois.forEach((poi, id) => finalPois.set(id, poi));\n      }\n      const pois = Array.from(finalPois.values()).sort((a, b) => a.routeKm - b.routeKm || a.offRouteM - b.offRouteM);\n",
)
app = replace_once(
    app,
    "      failedPoiSections = failedWorkloads;\n      renderPois(pois, config.categories);\n      setPoiStatus(\n        failedWorkloads.length > 0\n",
    "      failedPoiSections = incremental ? [...previousUnrelatedFailures, ...failedWorkloads] : failedWorkloads;\n      if (failedWorkloads.length === 0) {\n        categories.forEach((category) => loadedCategoryRadii.set(category.id, category.radiusM));\n      } else {\n        categories.forEach((category) => loadedCategoryRadii.delete(category.id));\n      }\n      renderPois(pois, config.categories);\n      setPoiStatus(\n        failedPoiSections.length > 0\n",
)
app = replace_once(
    app,
    "          ? `POI-Suche teilweise erfolgreich: ${failedWorkloads.length} Suchpaket${failedWorkloads.length === 1 ? '' : 'e'} endgültig fehlgeschlagen. ${pois.length} POIs aus erfolgreichen Paketen verfügbar.`\n",
    "          ? `POI-Suche teilweise erfolgreich: ${failedPoiSections.length} Suchpaket${failedPoiSections.length === 1 ? '' : 'e'} endgültig fehlgeschlagen. ${pois.length} POIs aus erfolgreichen Paketen verfügbar.`\n",
)
app = replace_once(
    app,
    "    if (enabling && currentParsedRoute) {\n      loadPois(currentParsedRoute, true, false);\n    } else {\n",
    "    if (enabling && currentParsedRoute && !categoryIsLoaded(categoryId)) {\n      loadPois(currentParsedRoute, true, false, [categoryId], [categoryId]);\n    } else {\n",
)
app = replace_once(
    app,
    "    const fallback = categoryRadiusOverrides.get(categoryId) || poiConfig?.categories.find((category) => category.id === categoryId)?.defaultRadiusM || 250;\n    const radiusM = Number(input.value);\n",
    "    const fallback = categoryRadiusOverrides.get(categoryId) || poiConfig?.categories.find((category) => category.id === categoryId)?.defaultRadiusM || 250;\n    const previousRadiusM = categoryRadiusMeters(categoryId);\n    const radiusM = Number(input.value);\n",
)
app = replace_once(
    app,
    "    categoryRadiusOverrides.set(categoryId, radiusM);\n    if (activeCategoryIds.has(categoryId) && currentParsedRoute) loadPois(currentParsedRoute, true, false);\n",
    "    categoryRadiusOverrides.set(categoryId, radiusM);\n    if (radiusM === previousRadiusM) return;\n    loadedCategoryRadii.delete(categoryId);\n    if (activeCategoryIds.has(categoryId) && currentParsedRoute) {\n      loadPois(currentParsedRoute, true, false, [categoryId], [categoryId]);\n    }\n",
)
app_path.write_text(app, encoding='utf-8')


test_path = Path('tests/incremental-poi-loading.test.mjs')
test_path.write_text("""import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');

function between(start, end) {
  const startIndex = app.indexOf(start);
  const endIndex = app.indexOf(end, startIndex);
  assert.ok(startIndex >= 0, `missing start marker: ${start}`);
  assert.ok(endIndex > startIndex, `missing end marker: ${end}`);
  return app.slice(startIndex, endIndex);
}

test('enabling a category fetches only an uncached category', () => {
  const block = between("poiCategories.addEventListener('click'", "poiCategories.addEventListener('change'");
  assert.match(block, /!categoryIsLoaded\(categoryId\)/);
  assert.match(block, /loadPois\(currentParsedRoute, true, false, \[categoryId\], \[categoryId\]\)/);
  assert.doesNotMatch(block, /loadPois\(currentParsedRoute, true, false\);/);
});

test('radius changes invalidate and replace only the affected category', () => {
  const block = between("poiCategories.addEventListener('change'", "poiPrevious.addEventListener");
  const invalidation = block.indexOf('loadedCategoryRadii.delete(categoryId)');
  const activeGuard = block.indexOf('if (activeCategoryIds.has(categoryId)');
  assert.ok(invalidation >= 0 && invalidation < activeGuard, 'cache must be invalidated before checking whether category is active');
  assert.match(block, /loadPois\(currentParsedRoute, true, false, \[categoryId\], \[categoryId\]\)/);
});

test('gap distance settings remain local-only', () => {
  const block = between('function applyGapSettingsFromInputs()', 'function markerIcon');
  assert.doesNotMatch(block, /loadPois\(/);
  assert.doesNotMatch(block, /fetch\(/);
});

test('only confirmed local Overture responses skip legacy pacing', () => {
  assert.match(app, /let paceAfterWorkload = true/);
  assert.match(app, /response\.headers\.get\('X-Bonkproof-Poi-Provider'\) \|\| 'overpass'/);
  assert.match(app, /paceAfterWorkload = candidates\.poiProvider !== 'overture-local'/);
  assert.match(app, /if \(paceAfterWorkload && workloadPosition < workloads\.length - 1\) await waitForPoiBackoff\(1000/);
});

test('loaded category cache is radius-aware and resets with route view state', () => {
  assert.match(app, /let loadedCategoryRadii = new Map\(\)/);
  assert.match(app, /loadedCategoryRadii\.get\(categoryId\) === radiusM/);
  assert.match(app, /loadedCategoryRadii = new Map\(\)/);
  assert.match(app, /loadedCategoryRadii\.set\(category\.id, category\.radiusM\)/);
});

test('successful radius replacement removes stale POIs only after the targeted request completes', () => {
  assert.match(app, /if \(incremental && replacedIds\.size > 0 && failedWorkloads\.length === 0\)/);
  assert.match(app, /filter\(\(poi\) => !replacedIds\.has\(poi\.category\.id\)\)/);
  assert.match(app, /freshQueriedPois\.forEach\(\(poi, id\) => finalPois\.set\(id, poi\)\)/);
});
""", encoding='utf-8')


doc_path = Path('docs/overture-local.md')
doc = doc_path.read_text(encoding='utf-8')
marker = "No Geoapify key or other live POI API key is required.\n"
addition = """

## Browser-side incremental loading

The browser keeps successfully loaded POI categories for the current route and radius in memory. Enabling a new category queries only that category; disabling and re-enabling an already loaded category at the same radius is local-only. Changing a category radius invalidates and reloads only that category. Gap-warning distance settings never trigger a POI request and only recalculate the existing route analysis.

The historical one-second inter-package delay is skipped only when a package is confirmed as served by the same-origin local Overture API. If a request falls back to the public Overpass service, the existing conservative pacing and retry behavior remains in place.
"""
if addition.strip() not in doc:
    if marker not in doc:
        raise SystemExit('Overture documentation marker missing.')
    doc = doc.replace(marker, marker + addition, 1)
    doc_path.write_text(doc, encoding='utf-8')
