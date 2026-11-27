import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRouteGeometry, projectPoiPassBys } from '../poi-projection.js';
import { buildScopedPoiQuerySections, createPoiQueryWorkloads, fetchPoiSectionWithRetry, mergeScopedPoiResults, preservePoiSelections, searchScopedPoiWorkloads } from '../poi-search.js';
import { buildFoundPoiWarnings, buildRoutebook, extractRouteGeometryRange, poiKey } from '../routebook.js';

const point = (lon, lat = 0) => ({ lat, lon });
const route = { segments: [[point(0), point(0.5), point(0)]] };

test('scope clips sparse GPX edges exactly and does not cross disconnected track segments', () => {
  const segments = { segments: [[point(0), point(0.5)], [point(5), point(5.5)]] };
  const boundary = buildRouteGeometry(segments)[0].lengthM;
  const sections = buildScopedPoiQuerySections(segments, boundary - 500, boundary, extractRouteGeometryRange);
  assert.equal(sections.length, 1);
  assert.ok(sections[0].points[0].lon > 0.49);
  assert.equal(sections[0].points.at(-1).lon, 0.5);
  assert.equal(buildScopedPoiQuerySections(route, 0, 45000, extractRouteGeometryRange).length, 3);
});

test('same road ridden in both directions keeps two stable passes even with a very wide radius', () => {
  const geometry = buildRouteGeometry(route);
  const nearStart = point(0.0005, 0.0001);
  const narrow = projectPoiPassBys(nearStart, geometry, 20);
  const wide = projectPoiPassBys(nearStart, geometry, 20000);
  assert.equal(narrow.length, 2);
  assert.deepEqual(wide.map((pass) => pass.passId), narrow.map((pass) => pass.passId));
  assert.ok(wide[0].routeMeters < 100);
  assert.ok(wide[1].routeMeters > 110000);

  const shortTurn = buildRouteGeometry({ segments: [[point(0), point(0.001), point(0)]] });
  assert.equal(projectPoiPassBys(point(0.0005), shortTurn, 2000).length, 2);
});

test('a self-crossing keeps separate passes and wider searches never renumber earlier keys', () => {
  const crossing = buildRouteGeometry({ segments: [[point(-0.01, -0.01), point(0.01, 0.01), point(-0.01, 0.01), point(0.01, -0.01)]] });
  const narrow = projectPoiPassBys(point(0, 0), crossing, 100);
  const wide = projectPoiPassBys(point(0, 0), crossing, 2000);
  assert.equal(narrow.length, 2);
  assert.equal(wide.length, 3);
  assert.deepEqual([wide[0].passId, wide[2].passId], narrow.map((pass) => pass.passId));
});

test('overlapping results merge by physical POI and pass, preserving pins and selected routebook stops', () => {
  const geometry = buildRouteGeometry(route);
  const visits = projectPoiPassBys(point(0.2), geometry, 100).map((pass) => ({
    ...pass, osmType: 'node', osmId: 42, status: 'match', name: 'Versorgung',
  }));
  const nearbyPoi = { ...visits[0], osmId: 43, name: 'Nachbar' };
  const pinnedPoi = { ...visits[0], osmId: 44, status: 'pinned', name: 'Pin' };
  const previous = [visits[0], pinnedPoi];
  const selected = new Set([poiKey(visits[0])]);
  const result = mergeScopedPoiResults(previous, [visits[0], nearbyPoi, visits[1], visits[1]], poiKey);
  assert.equal(result.length, 4);
  assert.ok(result.includes(pinnedPoi));
  assert.deepEqual(buildRoutebook(result, selected, 111195).stops, [visits[0]]);
  assert.ok(buildFoundPoiWarnings(result, 111195).longestGapM < buildFoundPoiWarnings(previous, 111195).longestGapM);
});

test('scoped queries retain successful and marked incomplete packages through later failures', async () => {
  const categories = [{ id: 'water', radiusM: 350 }];
  const sections = buildScopedPoiQuerySections(route, 5000, 55000, extractRouteGeometryRange);
  const results = [];
  const state = await searchScopedPoiWorkloads(createPoiQueryWorkloads(sections, categories), async (requested, section) => {
    assert.deepEqual(requested, categories);
    assert.ok(section.points.every(({ lon }) => lon < 0.5));
    if (section.index === 3) throw new Error('offline');
    return Object.assign([section.index], { poiIncomplete: section.index === 2, poiProvider: 'overture-local' });
  }, (elements) => results.push(...elements), { sleep: async () => {} });
  assert.deepEqual(results, [1, 2]);
  assert.deepEqual(state, { successful: 2, failed: 1, incomplete: 1, aborted: false });
});

test('aborting stops the queue, keeps finished results and discards a late response', async () => {
  const controller = new AbortController();
  const sections = buildScopedPoiQuerySections(route, 5000, 55000, extractRouteGeometryRange);
  const results = [];
  const calls = [];
  const state = await searchScopedPoiWorkloads(createPoiQueryWorkloads(sections, [{}]), async (_, section, signal) => {
    assert.equal(signal, controller.signal);
    calls.push(section.index);
    if (section.index === 2) controller.abort();
    return Object.assign([section.index], { poiProvider: 'overture-local' });
  }, (elements) => results.push(...elements), { signal: controller.signal });
  assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(results, [1]);
  assert.deepEqual(state, { successful: 1, failed: 0, incomplete: 0, aborted: true });
});

test('a pass selected or pinned during refresh survives by its own key, with unrelated stale fallbacks removed', () => {
  const [out, back] = projectPoiPassBys(point(0.2), buildRouteGeometry(route), 100).map((pass) => ({
    ...pass, osmType: 'node', osmId: 42, status: 'match', name: 'Markt',
  }));
  const stale = { ...out, osmId: 43, status: 'pinned' };
  const selected = new Set([poiKey(out)]);
  const pinned = new Set([poiKey(back)]);
  const preserved = preservePoiSelections([stale], [out, back, stale], selected, pinned, poiKey);
  assert.deepEqual(preserved.map((poi) => [poiKey(poi), poi.status]), [
    [poiKey(out), 'retained'], [poiKey(back), 'pinned'],
  ]);
  assert.deepEqual(buildRoutebook(preserved, selected, 111195).stops.map(poiKey), [poiKey(out)]);
  assert.deepEqual(preservePoiSelections([out], preserved, selected, new Set(), poiKey), [out]);
});

test('a cancelled request never starts or schedules a retry', async () => {
  const controller = new AbortController();
  let calls = 0;
  let sleeps = 0;
  const request = async () => {
    calls += 1;
    controller.abort();
    throw Object.assign(new Error('late gateway failure'), { status: 504 });
  };
  const options = { signal: controller.signal, sleep: async () => { sleeps += 1; } };
  assert.equal(await fetchPoiSectionWithRetry(request, {}, options), null);
  assert.equal(await fetchPoiSectionWithRetry(request, {}, options), null);
  assert.equal(calls, 1);
  assert.equal(sleeps, 0);
});

test('shared road ridden three times retains three ordered keys across increasing radii', () => {
  const repeated = { segments: [[point(0), point(0.5), point(0), point(0.5)]] };
  const geometry = buildRouteGeometry(repeated);
  const narrow = projectPoiPassBys(point(0.25, 0.0003), geometry, 40);
  const wide = projectPoiPassBys(point(0.25, 0.0003), geometry, 5000);
  assert.equal(narrow.length, 3);
  assert.deepEqual(narrow.map((pass) => pass.passId), wide.map((pass) => pass.passId));
  assert.ok(narrow[0].routeMeters < narrow[1].routeMeters && narrow[1].routeMeters < narrow[2].routeMeters);
  assert.equal(new Set(narrow.map((pass) => pass.passId)).size, 3);
});
