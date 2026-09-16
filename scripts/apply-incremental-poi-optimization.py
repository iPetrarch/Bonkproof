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
    "  let activeCategoryIds = new Set(INITIAL_CATEGORY_IDS);\n  let loadedCategoryIds = new Set();\n",
)
app = replace_once(
    app,
    "    activeCategoryIds = poiConfig ? defaultEnabledCategoryIds(poiConfig) : new Set(INITIAL_CATEGORY_IDS);\n",
    "    activeCategoryIds = poiConfig ? defaultEnabledCategoryIds(poiConfig) : new Set(INITIAL_CATEGORY_IDS);\n    loadedCategoryIds = new Set();\n",
)
app = replace_once(
    app,
    "    const payload = await response.json();\n    return Array.isArray(payload.elements) ? payload.elements : [];\n",
    "    const payload = await response.json();\n    const elements = Array.isArray(payload.elements) ? payload.elements : [];\n    Object.defineProperty(elements, 'poiProvider', {\n      value: response.headers.get('X-Bonkproof-POI-Provider') || 'overpass',\n      enumerable: false,\n    });\n    return elements;\n",
)
app = replace_once(
    app,
    "  async function loadPois(parsed, preserveSelection = false, retryFailedOnly = false) {\n",
    "  async function loadPois(parsed, preserveSelection = false, retryFailedOnly = false, requestedCategoryIds = null, replaceCategoryIds = null) {\n",
)
app = replace_once(
    app,
    "    if (!retryFailedOnly) clearPoiUi();\n",
    "    const incremental = Array.isArray(requestedCategoryIds);\n    if (!retryFailedOnly && !incremental) clearPoiUi();\n",
)
app = replace_once(
    app,
    "      const categories = buildActiveCategories(config, activeCategoryIds, categoryRadiusOverrides);\n",
    "      const queryCategoryIds = incremental ? new Set(requestedCategoryIds) : activeCategoryIds;\n      const categories = buildActiveCategories(config, queryCategoryIds, categoryRadiusOverrides);\n",
)
app = replace_once(
    app,
    "      const geometry = buildRouteGeometry(parsed);\n      const pinnedFallbacks = [...pinnedPoiSnapshots.entries()].map(([id, poi]) => [id, { ...poi, status: 'pinned' }]);\n      const deduped = new Map([...(retryFailedOnly ? currentPois : []).map((poi) => [poiKey(poi), poi]), ...pinnedFallbacks]);\n",
    "      const geometry = buildRouteGeometry(parsed);\n      const pinnedFallbacks = [...pinnedPoiSnapshots.entries()].map(([id, poi]) => [id, { ...poi, status: 'pinned' }]);\n      const replacedIds = new Set(replaceCategoryIds || []);\n      const existingPois = (retryFailedOnly || incremental)\n        ? currentPois.filter((poi) => !replacedIds.has(poi.category.id))\n        : [];\n      const deduped = new Map([...existingPois.map((poi) => [poiKey(poi), poi]), ...pinnedFallbacks]);\n",
)
app = replace_once(
    app,
    "        const workloadCategories = workload.categories;\n        if (signal.aborted) return;\n",
    "        const workloadCategories = workload.categories;\n        let paceAfterWorkload = false;\n        if (signal.aborted) return;\n",
)
app = replace_once(
    app,
    "          if (!candidates) return;\n          candidates.forEach((element) => {\n",
    "          if (!candidates) return;\n          paceAfterWorkload = candidates.poiProvider !== 'overture-local';\n          candidates.forEach((element) => {\n",
)
app = replace_once(
    app,
    "        if (workloadPosition < workloads.length - 1) await waitForPoiBackoff(1000, section, signal);\n",
    "        if (paceAfterWorkload && workloadPosition < workloads.length - 1) await waitForPoiBackoff(1000, section, signal);\n",
)
app = replace_once(
    app,
    "      failedPoiSections = failedWorkloads;\n      renderPois(pois, config.categories);\n",
    "      failedPoiSections = failedWorkloads;\n      if (failedWorkloads.length === 0) categories.forEach((category) => loadedCategoryIds.add(category.id));\n      renderPois(pois, config.categories);\n",
)
app = replace_once(
    app,
    "    if (enabling && currentParsedRoute) {\n      loadPois(currentParsedRoute, true, false);\n    } else {\n",
    "    if (enabling && currentParsedRoute && !loadedCategoryIds.has(categoryId)) {\n      loadPois(currentParsedRoute, true, false, [categoryId]);\n    } else {\n",
)
app = replace_once(
    app,
    "    if (activeCategoryIds.has(categoryId) && currentParsedRoute) loadPois(currentParsedRoute, true, false);\n",
    "    if (activeCategoryIds.has(categoryId) && currentParsedRoute) {\n      loadedCategoryIds.delete(categoryId);\n      loadPois(currentParsedRoute, true, false, [categoryId], [categoryId]);\n    }\n",
)
app_path.write_text(app, encoding='utf-8')

test_path = Path('tests/overture-provider.test.mjs')
test = test_path.read_text(encoding='utf-8')
marker = "test('monthly importer uses Overture GeoParquet, new taxonomy fields and generated SQLite data', () => {"
if marker not in test:
    raise SystemExit('Overture test file structure changed unexpectedly.')
if "incremental category loading avoids full-route reloads" not in test:
    test += '''

test('incremental category loading avoids full-route reloads and local Overture pacing', () => {
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.ok(app.includes('loadedCategoryIds = new Set()'));
  assert.ok(app.includes('loadPois(currentParsedRoute, true, false, [categoryId])'));
  assert.ok(app.includes('loadPois(currentParsedRoute, true, false, [categoryId], [categoryId])'));
  assert.ok(app.includes("paceAfterWorkload = candidates.poiProvider !== 'overture-local'"));
  assert.ok(app.includes('if (paceAfterWorkload && workloadPosition < workloads.length - 1)'));
});

test('gap distance settings remain local-only and do not reload POIs', () => {
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.ok(app.includes("gapSettingInputs.forEach((input) => input.addEventListener('input', applyGapSettingsFromInputs))"));
  const applyStart = app.indexOf('function applyGapSettingsFromInputs()');
  const markerStart = app.indexOf('function markerIcon', applyStart);
  const block = app.slice(applyStart, markerStart);
  assert.doesNotMatch(block, /loadPois\(/);
  assert.doesNotMatch(block, /fetch\(/);
});
'''
    test_path.write_text(test, encoding='utf-8')
