from pathlib import Path

path = Path('tests/ui-regressions.test.mjs')
text = path.read_text()
text = text.replace(
    "assert.match(app, /waitForPoiBackoff\\(2500/);",
    "assert.match(app, /waitForPoiBackoff\\(1000/);",
)
path.write_text(text)
