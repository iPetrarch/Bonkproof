from pathlib import Path

path = Path('tests/ui-regressions.test.mjs')
text = path.read_text()
text = text.replace(
    "assert.match(app, /if \\(section\\.index !== sections\\.at\\(-1\\)\\?\\.index\\)/);",
    "assert.match(app, /if \\(workloadPosition < workloads\\.length - 1\\) await waitForPoiBackoff\\(1000/);",
)
path.write_text(text)
