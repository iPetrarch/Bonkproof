export const ROUTEBOOK_GAP_WARNING_M = 60000;

export function poiKey(poi) {
  return `${poi.osmType}/${poi.osmId}`;
}

export function togglePoiSelection(selectedPoiIds, poiId) {
  const next = new Set(selectedPoiIds);
  if (next.has(poiId)) {
    next.delete(poiId);
  } else {
    next.add(poiId);
  }
  return next;
}

export function buildRoutebook(pois, selectedPoiIds, routeDistanceMeters) {
  const stops = pois
    .filter((poi) => selectedPoiIds.has(poiKey(poi)))
    .sort((a, b) => a.routeKm - b.routeKm || a.offRouteM - b.offRouteM);
  let previousMeters = 0;

  const entries = [
    { kind: 'start', name: 'Start', routeMeters: 0, distanceFromPreviousM: 0, isLongGap: false },
    ...stops.map((poi) => {
      const routeMeters = poi.routeKm * 1000;
      const distanceFromPreviousM = Math.max(0, routeMeters - previousMeters);
      previousMeters = routeMeters;
      return {
        kind: 'stop',
        poi,
        routeMeters,
        distanceFromPreviousM,
        isLongGap: distanceFromPreviousM > ROUTEBOOK_GAP_WARNING_M,
      };
    }),
  ];

  const distanceToFinishM = Math.max(0, routeDistanceMeters - previousMeters);
  entries.push({
    kind: 'finish',
    name: 'Finish',
    routeMeters: routeDistanceMeters,
    distanceFromPreviousM: distanceToFinishM,
    isLongGap: distanceToFinishM > ROUTEBOOK_GAP_WARNING_M,
  });

  return {
    entries,
    stops,
    longestGapM: Math.max(...entries.slice(1).map((entry) => entry.distanceFromPreviousM)),
  };
}

export function buildSupplyWarnings(pois, selectedPoiIds, routeDistanceMeters) {
  const routebook = buildRoutebook(pois, selectedPoiIds, routeDistanceMeters);
  const warnings = routebook.entries.slice(1)
    .map((entry, index) => ({ entry, previous: routebook.entries[index] }))
    .filter(({ entry }) => entry.distanceFromPreviousM > ROUTEBOOK_GAP_WARNING_M)
    .map(({ entry, previous }) => {
      return {
        from: previous.kind === 'stop' ? previous.poi.name : 'Start',
        to: entry.kind === 'stop' ? entry.poi.name : 'Ziel',
        startMeters: previous.routeMeters,
        endMeters: entry.routeMeters,
        lengthM: entry.distanceFromPreviousM,
      };
    });
  return { warnings, longestGapM: routebook.longestGapM, routebook };
}

function interpolate(a, b, fraction) {
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
}

export function extractRouteGeometryRange(parsedRoute, startMeters, endMeters) {
  const points = (parsedRoute?.segments || []).flatMap((segment) => segment);
  if (points.length < 2 || endMeters <= startMeters) return [];
  const result = [];
  let cumulative = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const length = Math.hypot((b.lat - a.lat) * 111000, (b.lon - a.lon) * 111000);
    const nextCumulative = cumulative + length;
    if (nextCumulative >= startMeters && cumulative <= endMeters && length > 0) {
      const from = Math.max(0, (startMeters - cumulative) / length);
      const to = Math.min(1, (endMeters - cumulative) / length);
      const fromPoint = interpolate([a.lat, a.lon], [b.lat, b.lon], from);
      const toPoint = interpolate([a.lat, a.lon], [b.lat, b.lon], to);
      if (!result.length || result[result.length - 1][0] !== fromPoint[0] || result[result.length - 1][1] !== fromPoint[1]) result.push(fromPoint);
      result.push(toPoint);
    }
    cumulative = nextCumulative;
    if (cumulative > endMeters) break;
  }
  return result.length > 1 ? [result] : [];
}
