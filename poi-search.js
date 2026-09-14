export const POI_QUERY_SECTION_MAX_M = 50_000;
export const POI_QUERY_OVERLAP_M = 1_000;
export const POI_QUERY_RETRY_DELAY_MS = 350;

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
    const sectionPoints = points.filter((_, index) => positions[index] >= queryStart && positions[index] <= queryEnd);
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

export function isRetryablePoiStatus(status) {
  return [502, 503, 504].includes(Number(status));
}

export async function fetchPoiSectionWithRetry(fetchSection, section, {
  signal,
  wait = POI_QUERY_RETRY_DELAY_MS,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  let retried = false;
  while (true) {
    try {
      return await fetchSection(section, signal);
    } catch (error) {
      if (retried || !isRetryablePoiStatus(error?.status)) throw error;
      retried = true;
      await sleep(wait);
      if (signal?.aborted) return null;
    }
  }
}
