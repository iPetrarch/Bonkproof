export const ROUTEBOOK_GAP_WARNING_M = 30000;

export function poiKey(poi) {
  const physicalKey = `${poi.osmType}/${poi.osmId}`;
  return poi.passId ? `${physicalKey}#${poi.passId}` : physicalKey;
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

export function buildRoutebook(pois, selectedPoiIds, routeDistanceMeters, warningThresholdM = ROUTEBOOK_GAP_WARNING_M) {
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
        isLongGap: distanceFromPreviousM > warningThresholdM,
      };
    }),
  ];

  const distanceToFinishM = Math.max(0, routeDistanceMeters - previousMeters);
  entries.push({
    kind: 'finish',
    name: 'Finish',
    routeMeters: routeDistanceMeters,
    distanceFromPreviousM: distanceToFinishM,
    isLongGap: distanceToFinishM > warningThresholdM,
  });

  return {
    entries,
    stops,
    longestGapM: Math.max(...entries.slice(1).map((entry) => entry.distanceFromPreviousM)),
    warningThresholdM,
  };
}

function buildGapWarnings(pois, selectedPoiIds, routeDistanceMeters, warningThresholdM = ROUTEBOOK_GAP_WARNING_M) {
  const routebook = buildRoutebook(pois, selectedPoiIds, routeDistanceMeters, warningThresholdM);
  const warnings = routebook.entries.slice(1)
    .map((entry, index) => ({ entry, previous: routebook.entries[index] }))
    .filter(({ entry }) => entry.distanceFromPreviousM > warningThresholdM)
    .map(({ entry, previous }) => {
      return {
        from: previous.kind === 'stop' ? previous.poi.name : 'Start',
        to: entry.kind === 'stop' ? entry.poi.name : 'Ziel',
        startMeters: previous.routeMeters,
        endMeters: entry.routeMeters,
        lengthM: entry.distanceFromPreviousM,
      };
    });
  return { warnings, longestGapM: routebook.longestGapM, routebook, warningThresholdM };
}

export function buildRoutebookWarnings(pois, selectedPoiIds, routeDistanceMeters, warningThresholdM = ROUTEBOOK_GAP_WARNING_M) {
  return buildGapWarnings(pois, selectedPoiIds, routeDistanceMeters, warningThresholdM);
}

export function buildFoundPoiWarnings(pois, routeDistanceMeters, warningThresholdM = ROUTEBOOK_GAP_WARNING_M) {
  const found = pois.filter((poi) => poi.status !== 'near-miss').sort((a, b) => a.routeKm - b.routeKm);
  const points = [{ name: 'Start', routeMeters: 0 }, ...found.map((poi) => ({ name: poi.name, routeMeters: poi.routeKm * 1000 })), { name: 'Ziel', routeMeters: routeDistanceMeters }];
  const warnings = points.slice(1).map((to, index) => {
    const from = points[index];
    return { from: from.name, to: to.name, startMeters: from.routeMeters, endMeters: to.routeMeters, lengthM: Math.max(0, to.routeMeters - from.routeMeters) };
  }).filter((warning) => warning.lengthM > warningThresholdM);
  return {
    warnings,
    longestGapM: Math.max(0, ...points.slice(1).map((to, index) => to.routeMeters - points[index].routeMeters)),
    foundCount: found.length,
    warningThresholdM,
  };
}

function interpolate(a, b, fraction) {
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
}

function routeDistanceMeters(a, b) {
  const earthRadius = 6371008.8;
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function extractRouteGeometryRange(parsedRoute, startDistanceM, endDistanceM) {
  if (!parsedRoute?.segments?.length || endDistanceM <= startDistanceM) return [];
  const lines = [];
  let cumulative = 0;
  for (const points of parsedRoute.segments) {
    const result = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      const length = routeDistanceMeters(a, b);
      const nextCumulative = cumulative + length;
      if (nextCumulative >= startDistanceM && cumulative <= endDistanceM && length > 0) {
        const from = Math.max(0, (startDistanceM - cumulative) / length);
        const to = Math.min(1, (endDistanceM - cumulative) / length);
        const fromPoint = interpolate([a.lat, a.lon], [b.lat, b.lon], from);
        const toPoint = interpolate([a.lat, a.lon], [b.lat, b.lon], to);
        if (!result.length || result[result.length - 1][0] !== fromPoint[0] || result[result.length - 1][1] !== fromPoint[1]) result.push(fromPoint);
        result.push(toPoint);
      }
      cumulative = nextCumulative;
      if (cumulative > endDistanceM) break;
    }
    if (result.length > 1) lines.push(result);
    if (cumulative > endDistanceM) break;
  }
  return lines;
}
