from pathlib import Path


def replace_once(text: str, old: str, new: str) -> str:
    if old not in text:
        raise SystemExit(f'Expected test snippet not found:\n{old}')
    return text.replace(old, new, 1)


dynamic_path = Path('tests/dynamic-poi-ui.test.mjs')
dynamic = dynamic_path.read_text(encoding='utf-8')
dynamic = replace_once(
    dynamic,
    "  assert.match(app, /buildActiveCategories\\(config, activeCategoryIds, categoryRadiusOverrides\\)/);\n",
    "  assert.match(app, /const queryCategoryIds = incremental \\? new Set\\(requestedCategoryIds\\) : activeCategoryIds/);\n  assert.match(app, /buildActiveCategories\\(config, queryCategoryIds, categoryRadiusOverrides\\)/);\n",
)
dynamic = replace_once(
    dynamic,
    "  assert.match(app, /if \\(enabling && currentParsedRoute\\) \\{\\s*loadPois\\(currentParsedRoute, true, false\\)/);\n  assert.match(app, /if \\(activeCategoryIds\\.has\\(categoryId\\) && currentParsedRoute\\) loadPois\\(currentParsedRoute, true, false\\)/);\n",
    "  assert.match(app, /if \\(enabling && currentParsedRoute && !categoryIsLoaded\\(categoryId\\)\\) \\{\\s*loadPois\\(currentParsedRoute, true, false, \\[categoryId\\], \\[categoryId\\]\\)/);\n  assert.match(app, /loadedCategoryRadii\\.delete\\(categoryId\\)[\\s\\S]*?if \\(activeCategoryIds\\.has\\(categoryId\\) && currentParsedRoute\\) \\{\\s*loadPois\\(currentParsedRoute, true, false, \\[categoryId\\], \\[categoryId\\]\\)/);\n",
)
dynamic_path.write_text(dynamic, encoding='utf-8')


ui_path = Path('tests/ui-regressions.test.mjs')
ui = ui_path.read_text(encoding='utf-8')
ui = replace_once(
    ui,
    "  assert.match(app, /const deduped = new Map\\(\\[\\.\\.\\.\\(retryFailedOnly \\? currentPois : \\[\\]\\)\\.map/);\n",
    "  assert.match(app, /const deduped = new Map\\(\\[\\.\\.\\.\\(retryFailedOnly \\|\\| incremental \\? currentPois : \\[\\]\\)\\.map/);\n",
)
ui = replace_once(
    ui,
    "  assert.match(app, /if \\(workloadPosition < workloads\\.length - 1\\) await waitForPoiBackoff\\(1000/);\n",
    "  assert.match(app, /if \\(paceAfterWorkload && workloadPosition < workloads\\.length - 1\\) await waitForPoiBackoff\\(1000/);\n  assert.match(app, /paceAfterWorkload = candidates\\.poiProvider !== 'overture-local'/);\n",
)
ui = replace_once(
    ui,
    "  assert.match(app, /if \\(enabling && currentParsedRoute\\)[\\s\\S]*?loadPois\\(currentParsedRoute, true, false\\)/);\n",
    "  assert.match(app, /if \\(enabling && currentParsedRoute && !categoryIsLoaded\\(categoryId\\)\\)[\\s\\S]*?loadPois\\(currentParsedRoute, true, false, \\[categoryId\\], \\[categoryId\\]\\)/);\n",
)
ui_path.write_text(ui, encoding='utf-8')
