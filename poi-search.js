import { buildRouteGeometry } from './poi-projection.js';

export const POI_QUERY_SECTION_MAX_M = 20_000;
export const POI_QUERY_OVERLAP_M = 1_000;
export const POI_QUERY_ADAPTIVE_MIN_M = 2_500;
export const POI_QUERY_RETRY_DELAY_MS = 350;
export const POI_RATE_LIMIT_FALLBACK_MS = 30_000;
export const POI_LIST_PAGE_SIZE = 20;

export function paginatePois(pois, page, pageSize = POI_LIST_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(pois.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = pois.length === 0 ? 0 : (currentPage - 1) * pageSize;
  return {
    page: currentPage,
    totalPages,
    startIndex,
    endIndex: Math.min(startIndex + pageSize, pois.length),
    items: pois.slice(startIndex, startIndex + pageSize),
  };
}

function clipPoiQueryPoints(points, start, end) {
  if (points.some((point) => point.routeMeters === undefined)) return points;
  const clipped = [];
  const boundary = (a, b, meters) => {
    const fraction = (meters - a.routeMeters) / (b.routeMeters - a.routeMeters);
    return { lat: a.lat + (b.lat - a.lat) * fraction, lon: a.lon + (b.lon - a.lon) * fraction, routeMeters: meters };
  };
  for (const [index, point] of points.entries()) {
    const previous = points[index - 1];
    if (previous && previous.routeMeters < start && point.routeMeters > start) {
      clipped.push(boundary(previous, point, start));
    }
    if (point.routeMeters >= start && point.routeMeters <= end) clipped.push(point);
    if (point.routeMeters > end) {
      if (previous && previous.routeMeters < end) clipped.push(boundary(previous, point, end));
      break;
    }
  }
  return clipped;
}

export function buildPoiQuerySections(parsed, maxMeters = POI_QUERY_SECTION_MAX_M, overlapMeters = POI_QUERY_OVERLAP_M) {
  const lines = [];
  for (const edge of buildRouteGeometry(parsed)) {
    const { sourceSegmentIndex, routeStartM, lengthM } = edge;
    if (!lines[sourceSegmentIndex]) lines[sourceSegmentIndex] = [{ ...edge.a, routeMeters: routeStartM }];
    lines[sourceSegmentIndex].push({ ...edge.b, routeMeters: routeStartM + lengthM });
  }
  const sections = [];
  for (const line of lines.filter(Boolean)) {
    const start = line[0].routeMeters;
    const end = line.at(-1).routeMeters;
    for (let coreStart = start; coreStart < end; coreStart += maxMeters) {
      const coreEnd = Math.min(end, coreStart + maxMeters);
      const queryStart = Math.max(start, coreStart - overlapMeters);
      const queryEnd = Math.min(end, coreEnd + overlapMeters);
      sections.push({
        index: sections.length + 1,
        coreStartMeters: coreStart,
        coreEndMeters: coreEnd,
        queryStartMeters: queryStart,
        queryEndMeters: queryEnd,
        points: clipPoiQueryPoints(line, queryStart, queryEnd),
      });
    }
  }
  const firstPoint = parsed.segments.find((segment) => segment.length)?.[0];
  if (!sections.length && firstPoint) {
    sections.push({ index: 1, coreStartMeters: 0, coreEndMeters: 0, queryStartMeters: 0, queryEndMeters: 0,
      points: [{ ...firstPoint, routeMeters: 0 }] });
  }
  return sections.map((section) => ({ ...section, total: sections.length }));
}

export function splitPoiQuerySection(section, minimumMeters = POI_QUERY_ADAPTIVE_MIN_M) {
  const length = section.coreEndMeters - section.coreStartMeters;
  if (length <= minimumMeters || section.points.length < 2) return [];
  const midpoint = section.coreStartMeters + length / 2;
  const overlap = POI_QUERY_OVERLAP_M;
  const make = (id, coreStartMeters, coreEndMeters) => {
    const queryStartMeters = Math.max(section.queryStartMeters, coreStartMeters - overlap);
    const queryEndMeters = Math.min(section.queryEndMeters, coreEndMeters + overlap);
    return {
      ...section,
      index: id,
      parentSectionId: section.index,
      coreStartMeters,
      coreEndMeters,
      queryStartMeters,
      queryEndMeters,
      points: clipPoiQueryPoints(section.points, queryStartMeters, queryEndMeters),
    };
  };
  return [make(`${section.index}.1`, section.coreStartMeters, midpoint), make(`${section.index}.2`, midpoint, section.coreEndMeters)];
}

export function createPoiQueryWorkloads(sections, categories) {
  return sections.map((section) => ({
    id: String(section.index),
    section,
    categories: [...categories],
  }));
}

export function splitPoiQueryWorkload(workload, minimumMeters = POI_QUERY_ADAPTIVE_MIN_M) {
  const sectionParts = splitPoiQuerySection(workload.section, minimumMeters);
  if (sectionParts.length === 2) {
    return sectionParts.map((section) => ({
      id: String(section.index),
      section,
      categories: [...workload.categories],
    }));
  }

  if (workload.categories.length > 1) {
    const midpoint = Math.ceil(workload.categories.length / 2);
    const categoryGroups = [workload.categories.slice(0, midpoint), workload.categories.slice(midpoint)].filter((group) => group.length > 0);
    return categoryGroups.map((categories, index) => ({
      id: `${workload.id}.${index === 0 ? 'a' : 'b'}`,
      section: workload.section,
      categories,
    }));
  }

  return [];
}

export function isRetryablePoiStatus(status) {
  return [502, 503, 504].includes(Number(status));
}

export function retryAfterMilliseconds(value, fallback = POI_RATE_LIMIT_FALLBACK_MS, now = Date.now()) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value * 1000;
  const text = String(value ?? '').trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text) * 1000;
  const date = Date.parse(text);
  return Number.isFinite(date) ? Math.max(0, date - now) : fallback;
}

export async function fetchPoiSectionWithRetry(fetchSection, section, {
  signal,
  wait = POI_QUERY_RETRY_DELAY_MS,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  onBackoff = () => {},
  rateLimitFallback = POI_RATE_LIMIT_FALLBACK_MS,
} = {}) {
  let retried = false;
  while (true) {
    if (signal?.aborted) return null;
    try {
      return await fetchSection(section, signal);
    } catch (error) {
      if (signal?.aborted) return null;
      const rateLimited = Number(error?.status) === 429;
      if (retried || (!rateLimited && !isRetryablePoiStatus(error?.status))) throw error;
      retried = true;
      const delay = rateLimited ? retryAfterMilliseconds(error?.retryAfter, rateLimitFallback) : wait;
      onBackoff(delay, error);
      await sleep(delay);
      if (signal?.aborted) return null;
    }
  }
}

export function buildScopedPoiQuerySections(parsed, startMeters, endMeters, extractRange) {
  const sections = [];
  for (let start = startMeters; start < endMeters; start += POI_QUERY_SECTION_MAX_M) {
    const end = Math.min(start + POI_QUERY_SECTION_MAX_M, endMeters);
    for (const line of extractRange(parsed, start, end)) {
      sections.push({
        index: sections.length + 1,
        coreStartMeters: start,
        coreEndMeters: end,
        queryStartMeters: start,
        queryEndMeters: end,
        points: line.map(([lat, lon]) => ({ lat, lon })),
      });
    }
  }
  return sections;
}

function waitForScopedQuery(delay, signal) {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, delay);
    if (signal?.aborted) done();
    else signal?.addEventListener('abort', done, { once: true });
  });
}

export async function searchScopedPoiWorkloads(workloads, fetchCandidates, collect, {
  signal,
  onProgress = () => {},
  sleep = waitForScopedQuery,
} = {}) {
  const queue = [...workloads];
  let successful = 0;
  let failed = 0;
  let incomplete = 0;
  for (const [index, workload] of queue.entries()) {
    if (signal?.aborted) break;
    onProgress(index + 1, queue.length);
    let pace = true;
    try {
      const candidates = await fetchPoiSectionWithRetry(
        (section, requestSignal) => fetchCandidates(workload.categories, section, requestSignal),
        workload.section,
        { signal, sleep: (delay) => sleep(delay, signal) },
      );
      if (signal?.aborted || !candidates) break;
      collect(candidates, workload.categories);
      pace = candidates.poiProvider !== 'overture-local';
      successful += 1;
      if (candidates.poiIncomplete) incomplete += 1;
    } catch (error) {
      if (signal?.aborted) break;
      // Category splitting preserves the clipped geometry of each package.
      const parts = Number(error?.status) === 504 ? splitPoiQueryWorkload(workload, Infinity) : [];
      if (parts.length) queue.splice(index + 1, 0, ...parts);
      else failed += 1;
    }
    if (pace && index + 1 < queue.length) await sleep(1000, signal);
  }
  return { successful, failed, incomplete, aborted: Boolean(signal?.aborted) };
}

export function mergeScopedPoiResults(existing, accepted, key) {
  const merged = new Map(existing.map((poi) => [key(poi), poi]));
  for (const poi of accepted) {
    const id = key(poi);
    const previous = merged.get(id);
    if (!previous || previous.status !== 'match' && poi.status === 'match') merged.set(id, poi);
  }
  return [...merged.values()];
}


export function preservePoiSelections(results, snapshots, selectedIds, pinnedIds, key) {
  const merged = new Map();
  for (const poi of results) {
    if (poi.status !== 'pinned' && poi.status !== 'retained') merged.set(key(poi), poi);
  }
  for (const poi of snapshots) {
    const id = key(poi);
    if (merged.has(id)) continue;
    if (pinnedIds.has(id)) merged.set(id, { ...poi, status: 'pinned' });
    else if (selectedIds.has(id)) merged.set(id, { ...poi, status: 'retained' });
  }
  return [...merged.values()];
}
