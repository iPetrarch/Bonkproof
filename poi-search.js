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

export function buildPoiQuerySections(parsed, maxMeters = POI_QUERY_SECTION_MAX_M, overlapMeters = POI_QUERY_OVERLAP_M) {
  const points = parsed.segments.flat();
  if (points.length === 0) return [];
  const toRad = (value) => value * Math.PI / 180;
  const positions = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const dLat = toRad(current.lat - previous.lat);
    const dLon = toRad(current.lon - previous.lon);
    const lat1 = toRad(previous.lat);
    const lat2 = toRad(current.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    positions.push(positions[index - 1] + 6371008.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h))));
  }
  const totalMeters = positions.at(-1);
  const sections = [];
  for (let coreStart = 0; coreStart < totalMeters || (totalMeters === 0 && coreStart === 0); coreStart += maxMeters) {
    const coreEnd = Math.min(totalMeters, coreStart + maxMeters);
    const queryStart = Math.max(0, coreStart - overlapMeters);
    const queryEnd = Math.min(totalMeters, coreEnd + overlapMeters);
    const sectionPoints = points
      .map((point, index) => ({ point: { ...point, routeMeters: positions[index] }, position: positions[index] }))
      .filter(({ position }) => position >= queryStart && position <= queryEnd)
      .map(({ point }) => point);
    sections.push({
      index: sections.length + 1,
      total: Math.max(1, Math.ceil(totalMeters / maxMeters)),
      coreStartMeters: coreStart,
      coreEndMeters: coreEnd,
      queryStartMeters: queryStart,
      queryEndMeters: queryEnd,
      points: sectionPoints.length > 0 ? sectionPoints : [points[0]],
    });
  }
  return sections;
}

export function splitPoiQuerySection(section, minimumMeters = POI_QUERY_ADAPTIVE_MIN_M) {
  const length = section.coreEndMeters - section.coreStartMeters;
  if (length <= minimumMeters || section.points.length < 2) return [];
  const midpoint = section.coreStartMeters + length / 2;
  const overlap = POI_QUERY_OVERLAP_M;
  const make = (id, coreStartMeters, coreEndMeters) => ({
    ...section,
    index: id,
    parentSectionId: section.index,
    coreStartMeters,
    coreEndMeters,
    queryStartMeters: Math.max(section.queryStartMeters, coreStartMeters - overlap),
    queryEndMeters: Math.min(section.queryEndMeters, coreEndMeters + overlap),
    points: section.points.filter((point) => point.routeMeters === undefined || (point.routeMeters >= Math.max(section.queryStartMeters, coreStartMeters - overlap) && point.routeMeters <= Math.min(section.queryEndMeters, coreEndMeters + overlap))),
  });
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
    try {
      return await fetchSection(section, signal);
    } catch (error) {
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
