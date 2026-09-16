from pathlib import Path

app_path = Path('app.js')
text = app_path.read_text()

replacements = [
    (
        "    const statusText = poi.status === 'near-miss' ? 'Near miss' : 'Inside corridor';",
        "    const statusText = poi.status === 'near-miss' ? 'Near miss' : (poi.status === 'pinned' ? 'Behalten aus vorheriger Suche' : 'Inside corridor');",
    ),
    (
        "    const mapPois = visiblePois.concat(currentPois.filter((poi) => !activeCategoryIds.has(poi.category.id) && selectedPoiIds.has(poiKey(poi))));",
        "    const mapPois = visiblePois.concat(currentPois.filter((poi) => !activeCategoryIds.has(poi.category.id) && !pinnedPoiIds.has(poiKey(poi)) && selectedPoiIds.has(poiKey(poi))));",
    ),
    (
        "      item.className = `poi-list-item ${poi.status === 'near-miss' ? 'near-miss' : ''} ${selectedPoiIds.has(poiId) ? 'selected' : ''}`;",
        "      item.className = `poi-list-item ${poi.status === 'near-miss' ? 'near-miss' : ''} ${pinned ? 'pinned' : ''} ${selectedPoiIds.has(poiId) ? 'selected' : ''}`;",
    ),
    (
        "    if (activeCategoryIds.size === 0) {\n      poiEmpty.textContent = 'Keine POI-Kategorie ausgewählt.';\n      poiEmpty.hidden = false;",
        "    if (activeCategoryIds.size === 0 && visiblePois.length === 0) {\n      poiEmpty.textContent = 'Keine POI-Kategorie ausgewählt.';\n      poiEmpty.hidden = false;",
    ),
    (
        "        ? (activeCategoryIds.size === 0 ? 'Keine POI-Kategorie ausgewählt.' : 'No POIs were found in the enabled categories inside the current route corridors.')",
        "        ? (activeCategoryIds.size === 0 ? 'Keine POI-Kategorie ausgewählt.' : 'No POIs were found in the enabled categories inside the current route corridors.')",
    ),
    (
        "      if (categories.length === 0) {\n        failedPoiSections = [];\n        poiSectionStatus = { total: 0, completed: 0, failed: new Set(), started: true };\n        renderPois([], config.categories);\n        return;\n      }",
        "      if (categories.length === 0) {\n        failedPoiSections = [];\n        poiSectionStatus = { total: 0, completed: 0, failed: new Set(), started: true };\n        const pinnedFallbacks = [...pinnedPoiSnapshots.values()].map((poi) => ({ ...poi, status: 'pinned' }));\n        renderPois(pinnedFallbacks, config.categories);\n        return;\n      }",
    ),
]

for old, new in replacements:
    if old == new:
        continue
    if old not in text:
        raise SystemExit(f'Missing expected app.js fragment: {old[:120]!r}')
    text = text.replace(old, new, 1)

app_path.write_text(text)

test_path = Path('tests/ui-regressions.test.mjs')
tests = test_path.read_text()
old = "  assert.match(app, /const deduped = new Map\\(\\(retryFailedOnly \\? currentPois : \\[\\]\\)/);"
new = "  assert.match(app, /const pinnedFallbacks = \\[\\.\\.\\.pinnedPoiSnapshots\\.entries\\(\\)\\]/);\n  assert.match(app, /const deduped = new Map\\(\\[\\.\\.\\.\\(retryFailedOnly \\? currentPois : \\[\\]\\)\\.map/);"
if old not in tests:
    raise SystemExit('Missing old retry dedupe assertion')
tests = tests.replace(old, new, 1)
test_path.write_text(tests)

pin_test_path = Path('tests/pinned-pois.test.mjs')
pin_tests = pin_test_path.read_text()
extra = """

test('pins survive when every category is disabled', () => {
  assert.match(app, /if \(categories\.length === 0\)[\s\S]*pinnedFallbacks[\s\S]*renderPois\(pinnedFallbacks, config\.categories\)/);
});

test('pinned and selected POIs are not duplicated on the map', () => {
  assert.match(app, /!pinnedPoiIds\.has\(poiKey\(poi\)\) && selectedPoiIds\.has\(poiKey\(poi\)\)/);
});

test('pinned fallbacks are labelled distinctly from current corridor matches', () => {
  assert.match(app, /poi\.status === 'pinned' \? 'Behalten aus vorheriger Suche'/);
  assert.match(app, /\$\{pinned \? 'pinned' : ''\}/);
});
"""
if "pins survive when every category is disabled" not in pin_tests:
    pin_tests += extra
pin_test_path.write_text(pin_tests)
