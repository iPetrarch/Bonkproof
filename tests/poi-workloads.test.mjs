import assert from 'node:assert/strict';
import test from 'node:test';
import {
  POI_QUERY_ADAPTIVE_MIN_M,
  POI_QUERY_SECTION_MAX_M,
  buildPoiQuerySections,
  createPoiQueryWorkloads,
  splitPoiQuerySection,
  splitPoiQueryWorkload,
} from '../poi-search.js';

function routeOfKm(kilometres) {
  const points = Array.from({ length: Math.ceil(kilometres) + 1 }, (_, index) => ({ lat: index * (1 / 111.2), lon: 0 }));
  return { segments: [points] };
}

const categories = [
  { id: 'supermarket' },
  { id: 'fuel' },
  { id: 'drinking_water' },
  { id: 'bakery' },
];

test('initial POI workloads use smaller 20 km route sections', () => {
  assert.equal(POI_QUERY_SECTION_MAX_M, 20_000);
  assert.equal(buildPoiQuerySections(routeOfKm(19)).length, 1);
  assert.equal(buildPoiQuerySections(routeOfKm(41)).length, 3);
});

test('route sections can split recursively down to the adaptive minimum', () => {
  assert.equal(POI_QUERY_ADAPTIVE_MIN_M, 2_500);
  const section = buildPoiQuerySections(routeOfKm(20))[0];
  const halves = splitPoiQuerySection(section);
  assert.equal(halves.length, 2);
  assert.deepEqual(halves.map((part) => part.index), ['1.1', '1.2']);
  const quarters = splitPoiQuerySection(halves[0]);
  assert.equal(quarters.length, 2);
  assert.deepEqual(quarters.map((part) => part.index), ['1.1.1', '1.1.2']);
  const eighths = splitPoiQuerySection(quarters[0]);
  assert.equal(eighths.length, 2);
  const minimumParts = splitPoiQuerySection(eighths[0]);
  assert.equal(minimumParts.length, 0);
});

test('workloads split route geometry before splitting categories', () => {
  const section = buildPoiQuerySections(routeOfKm(20))[0];
  const [workload] = createPoiQueryWorkloads([section], categories);
  const parts = splitPoiQueryWorkload(workload);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map((part) => part.categories.map((category) => category.id)), [
    categories.map((category) => category.id),
    categories.map((category) => category.id),
  ]);
  assert.ok(parts.every((part) => part.section.coreEndMeters - part.section.coreStartMeters < 20_000));
});

test('minimum-size workloads fall back to category splitting', () => {
  const section = {
    index: '7.1.1.1',
    coreStartMeters: 0,
    coreEndMeters: 2_500,
    queryStartMeters: 0,
    queryEndMeters: 3_500,
    points: [{ lat: 0, lon: 0, routeMeters: 0 }, { lat: 0.02, lon: 0, routeMeters: 2_500 }],
  };
  const [workload] = createPoiQueryWorkloads([section], categories);
  const parts = splitPoiQueryWorkload(workload);
  assert.deepEqual(parts.map((part) => part.categories.map((category) => category.id)), [
    ['supermarket', 'fuel'],
    ['drinking_water', 'bakery'],
  ]);
  assert.ok(parts.every((part) => part.section === section));
});

test('a single-category minimum workload is the only irreducible case', () => {
  const section = {
    index: '9.1.1.1',
    coreStartMeters: 0,
    coreEndMeters: 2_500,
    queryStartMeters: 0,
    queryEndMeters: 3_500,
    points: [{ lat: 0, lon: 0, routeMeters: 0 }, { lat: 0.02, lon: 0, routeMeters: 2_500 }],
  };
  assert.deepEqual(splitPoiQueryWorkload({ id: String(section.index), section, categories: [categories[0]] }), []);
});
