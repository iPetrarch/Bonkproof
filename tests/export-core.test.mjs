import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createExportFile,
  sanitizeExportBaseName,
  serializeGpxWithRoutePoints,
  serializeTcxCourse,
} from '../export-core.js';

const selected = {
  id: 'node/1#pass-1',
  name: 'Bäcker & Markt <Nord>',
  description: 'Wasser & Snacks',
  lat: 53.1,
  lon: 7.4,
  routeKm: 12.3,
  categoryId: 'supermarket',
  categoryLabel: 'Supermarkt',
  selected: true,
  passIdentity: { physicalPoiId: 'node/1', passId: 'pass-1', passIndex: 1, passCount: 2 },
};

test('GPX export preserves original route content and adds selected waypoints', () => {
  const source = '<?xml version="1.0"?><gpx version="1.1"><metadata><name>Original</name></metadata><trk><name>Keep me</name><trkseg><trkpt lat="1" lon="2"><ele>4</ele><time>2026-01-01T00:00:00Z</time><extensions><x>y</x></extensions></trkpt></trkseg></trk></gpx>';
  const result = serializeGpxWithRoutePoints(source, [selected]);
  assert.match(result, /<trk><name>Keep me<\/name>/);
  assert.match(result, /<ele>4<\/ele><time>2026-01-01T00:00:00Z<\/time><extensions><x>y<\/x><\/extensions>/);
  assert.match(result, /<wpt lat="53\.1000000" lon="7\.4000000">/);
  assert.match(result, /Bäcker &amp; Markt &lt;Nord&gt;/);
  assert.ok(result.indexOf('<wpt ') < result.indexOf('<trk>'));
});

test('GPX export leaves existing source waypoints intact and emits repeated pass-bys separately', () => {
  const source = '<gpx><wpt lat="1" lon="1"><name>Existing</name></wpt><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>';
  const second = { ...selected, id: 'node/1#pass-2', routeKm: 80, passIdentity: { ...selected.passIdentity, passId: 'pass-2', passIndex: 2 } };
  const result = serializeGpxWithRoutePoints(source, [second, selected]);
  assert.equal((result.match(/<wpt\b/g) || []).length, 3);
  assert.ok(result.indexOf('Route km 12.3') < result.indexOf('Route km 80.0'));
});

test('GPX export uses the source namespace prefix for injected elements', () => {
  const source = '<g:gpx xmlns:g="http://www.topografix.com/GPX/1/1"><g:trk><g:trkseg><g:trkpt lat="1" lon="1"/></g:trkseg></g:trk></g:gpx>';
  const result = serializeGpxWithRoutePoints(source, [selected]);
  assert.match(result, /<g:wpt /);
  assert.match(result, /<g:name>/);
});

test('unselected route points are not exported', () => {
  const source = '<gpx><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>';
  const result = serializeGpxWithRoutePoints(source, [{ ...selected, selected: false }]);
  assert.equal(result, source);
});

test('TCX export keeps route segments separate and sorts CoursePoints by route position', () => {
  const later = { ...selected, id: 'node/1#pass-2', name: 'Later stop', routeKm: 80 };
  const tcx = serializeTcxCourse({
    routeName: 'Long route',
    segments: [
      [{ lat: 53, lon: 7 }, { lat: 53.01, lon: 7.01 }],
      [{ lat: 53.02, lon: 7.02 }, { lat: 53.03, lon: 7.03 }],
    ],
    routePoints: [later, selected],
  });
  assert.equal((tcx.match(/<Track>/g) || []).length, 2);
  assert.equal((tcx.match(/<CoursePoint>/g) || []).length, 2);
  const distances = [...tcx.matchAll(/<DistanceMeters>([0-9.]+)<\/DistanceMeters>/g)].map((match) => Number(match[1]));
  assert.ok(distances[2] - distances[1] < 1, 'new track segment must not add a straight-line jump');
  assert.ok(tcx.indexOf('Route km 12.3') < tcx.indexOf('Route km 80.0'));
  assert.match(tcx, /<Name>Bäcker &amp; M<\/Name>/);
  assert.match(tcx, /<Notes>Bäcker &amp; Markt &lt;Nord&gt; · Wasser &amp; Snacks/);
});

test('export filenames are sanitized and stable', () => {
  assert.equal(sanitizeExportBaseName('Münster → Leer.gpx'), 'Munster-Leer');
  const file = createExportFile('gpx', {
    fileName: 'Münster → Leer.gpx',
    sourceGpx: '<gpx><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>',
    routePoints: [],
  });
  assert.equal(file.filename, 'Munster-Leer-bonkproof.gpx');
});

test('TCX remains exportable without selected stops', () => {
  const file = createExportFile('tcx', {
    fileName: 'route.gpx',
    routeName: 'Route',
    segments: [[{ lat: 53, lon: 7 }, { lat: 53.1, lon: 7.1 }]],
    routePoints: [],
  });
  assert.match(file.content, /<Track>/);
  assert.doesNotMatch(file.content, /<CoursePoint>/);
});


test('export-only warning points are serialized without entering normal selection state', () => {
  const warning = {
    id: 'bonkproof-gap:1000:40000:0',
    name: '39 km supply gap',
    description: 'Critical supply gap',
    lat: 53.2,
    lon: 7.5,
    routeKm: 9.999,
    categoryId: 'supply_gap_warning',
    categoryLabel: 'Supply gap warning',
    selected: false,
    exportOnly: true,
  };
  const gpx = serializeGpxWithRoutePoints(
    '<gpx><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>',
    [warning],
  );
  assert.match(gpx, /39 km supply gap/);

  const tcx = serializeTcxCourse({
    routeName: 'Route',
    segments: [[{ lat: 53, lon: 7 }, { lat: 53.3, lon: 7.6 }]],
    routePoints: [warning],
  });
  assert.equal((tcx.match(/<CoursePoint>/g) || []).length, 1);
  assert.match(tcx, /Critical supply gap/);
});
