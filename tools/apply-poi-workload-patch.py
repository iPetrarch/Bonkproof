from pathlib import Path

path = Path('tests/ui-regressions.test.mjs')
text = path.read_text()
text = text.replace(
    "  assert.match(app, /poiSectionStatus\\.failed\\.add\\(section\\.index\\)/);",
    "  assert.match(app, /poiSectionStatus\\.failed\\.add\\(workload\\.id\\)/);",
)
text = text.replace(
    """test('POI query sections cover short, exact and long routes with overlap', () => {
  assert.equal(buildPoiQuerySections(routeOfKm(49)).length, 1);
  assert.equal(buildPoiQuerySections(routeOfKm(50)).length, 1);
  const longSections = buildPoiQuerySections(routeOfKm(234));
  assert.equal(longSections.length, 5);
  assert.ok(longSections[1].queryStartMeters < longSections[1].coreStartMeters);
  assert.ok(longSections[0].queryEndMeters > longSections[0].coreEndMeters);
});

""",
    """test('POI query sections cover short, exact and long routes with overlap', () => {
  assert.equal(buildPoiQuerySections(routeOfKm(19)).length, 1);
  assert.equal(buildPoiQuerySections(routeOfKm(20)).length, 1);
  const longSections = buildPoiQuerySections(routeOfKm(234));
  assert.equal(longSections.length, 12);
  assert.ok(longSections[1].queryStartMeters < longSections[1].coreStartMeters);
  assert.ok(longSections[0].queryEndMeters > longSections[0].coreEndMeters);
});

""",
)
text = text.replace(
    """test('adaptive section splitting is one-time, halves the core and preserves overlap', () => {
  const section = { index: 3, coreStartMeters: 100000, coreEndMeters: 150000, queryStartMeters: 99000, queryEndMeters: 150000, points: [{ lat: 1, lon: 1, routeMeters: 100000 }, { lat: 2, lon: 2, routeMeters: 125000 }, { lat: 3, lon: 3, routeMeters: 150000 }] };
  const parts = splitPoiQuerySection(section);
  assert.deepEqual(parts.map((part) => part.index), ['3.1', '3.2']);
  assert.equal(parts[0].coreEndMeters, 125000);
  assert.equal(parts[1].queryStartMeters, 124000);
  assert.equal(splitPoiQuerySection({ ...section, parentSectionId: 3 }).length, 0);
  assert.equal(splitPoiQuerySection({ ...section, coreEndMeters: 115000 }).length, 0);
});

""",
    """test('adaptive section splitting is recursive, halves the core and preserves overlap', () => {
  const section = { index: 3, coreStartMeters: 100000, coreEndMeters: 120000, queryStartMeters: 99000, queryEndMeters: 121000, points: [{ lat: 1, lon: 1, routeMeters: 100000 }, { lat: 2, lon: 2, routeMeters: 110000 }, { lat: 3, lon: 3, routeMeters: 120000 }] };
  const parts = splitPoiQuerySection(section);
  assert.deepEqual(parts.map((part) => part.index), ['3.1', '3.2']);
  assert.equal(parts[0].coreEndMeters, 110000);
  assert.equal(parts[1].queryStartMeters, 109000);
  const nested = splitPoiQuerySection(parts[0]);
  assert.deepEqual(nested.map((part) => part.index), ['3.1.1', '3.1.2']);
  assert.equal(splitPoiQuerySection({ ...section, coreEndMeters: 102500 }).length, 0);
});

""",
)
text = text.replace(
    """test('a repeated 504 is the only adaptive split trigger and subunits stay sequential', () => {
  assert.match(app, /Number\\(error\\?\\.status\\) === 504 \\? splitPoiQuerySection\\(section\\) : \\[\\]/);
  assert.match(app, /sections\\.splice\\(sectionPosition \\+ 1, 0, \\.\\.\\.subSections\\)/);
  assert.doesNotMatch(app, /Number\\(error\\?\\.status\\) === 429 \\? splitPoiQuerySection/);
});

""",
    """test('a repeated 504 adaptively splits workloads and replacements stay sequential', () => {
  assert.match(app, /Number\\(error\\?\\.status\\) === 504 \\? splitPoiQueryWorkload\\(workload\\) : \\[\\]/);
  assert.match(app, /workloads\\.splice\\(workloadPosition \\+ 1, 0, \\.\\.\\.replacements\\)/);
  assert.doesNotMatch(app, /Number\\(error\\?\\.status\\) === 429 \\? splitPoiQueryWorkload/);
});

""",
)
text = text.replace(
    "test('section requests are sequential and not parallel', () => {\n  assert.match(app, /for \\(let sectionPosition = 0; sectionPosition < sections\\.length/);\n  assert.doesNotMatch(app, /Promise\\.all\\(sections/);\n});",
    "test('workload requests are sequential and not parallel', () => {\n  assert.match(app, /for \\(let workloadPosition = 0; workloadPosition < workloads\\.length/);\n  assert.doesNotMatch(app, /Promise\\.all\\(workloads/);\n});",
)
path.write_text(text)
