export const ROUTEBOOK_GAP_WARNING_M = 30000;

export const DEFAULT_GAP_SETTINGS = Object.freeze({
  criticalDistanceKm: 30,
  infoPercent: 66,
  warningPercent: 80,
  criticalPercent: 95,
});

export function normalizeGapSettings(settings = DEFAULT_GAP_SETTINGS) {
  const normalized = {
    criticalDistanceKm: Number(settings.criticalDistanceKm),
    infoPercent: Number(settings.infoPercent),
    warningPercent: Number(settings.warningPercent),
    criticalPercent: Number(settings.criticalPercent),
  };

  if (!Number.isFinite(normalized.criticalDistanceKm) || normalized.criticalDistanceKm <= 0) {
    throw new RangeError('Critical distance must be greater than 0 km.');
  }
  for (const key of ['infoPercent', 'warningPercent', 'criticalPercent']) {
    if (!Number.isFinite(normalized[key]) || normalized[key] <= 0 || normalized[key] > 100) {
      throw new RangeError('Gap severity percentages must be greater than 0 and at most 100.');
    }
  }
  if (!(normalized.infoPercent < normalized.warningPercent && normalized.warningPercent < normalized.criticalPercent)) {
    throw new RangeError('Gap severity percentages must satisfy Info < Warning < Critical.');
  }
  return normalized;
}

export function buildGapThresholds(settings = DEFAULT_GAP_SETTINGS) {
  const normalized = normalizeGapSettings(settings);
  const referenceM = normalized.criticalDistanceKm * 1000;
  return {
    ...normalized,
    referenceM,
    infoM: referenceM * normalized.infoPercent / 100,
    warningM: referenceM * normalized.warningPercent / 100,
    criticalM: referenceM * normalized.criticalPercent / 100,
  };
}

export function classifyGapMeters(lengthM, settings = DEFAULT_GAP_SETTINGS) {
  const thresholds = buildGapThresholds(settings);
  if (lengthM > thresholds.criticalM) return 'critical';
  if (lengthM > thresholds.warningM) return 'warning';
  if (lengthM > thresholds.infoM) return 'info';
  return null;
}

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

function gapClassifier(gapConfig) {
  if (typeof gapConfig === 'number') {
    return {
      thresholdM: gapConfig,
      classify: (lengthM) => (lengthM > gapConfig ? 'critical' : null),
    };
  }
  const settings = normalizeGapSettings(gapConfig || DEFAULT_GAP_SETTINGS);
  const thresholds = buildGapThresholds(settings);
  return {
    settings,
    thresholds,
    thresholdM: thresholds.infoM,
    classify: (lengthM) => classifyGapMeters(lengthM, settings),
  };
}

export function buildRoutebook(pois, selectedPoiIds, routeDistanceMeters, gapConfig = ROUTEBOOK_GAP_WARNING_M) {
  const severity = gapClassifier(gapConfig);
  const stops = pois
    .filter((poi) => selectedPoiIds.has(poiKey(poi)))
    .sort((a, b) => a.routeKm - b.routeKm || a.offRouteM - b.offRouteM);
  let previousMeters = 0;

  const entries = [
    { kind: 'start', name: 'Start', routeMeters: 0, distanceFromPreviousM: 0, isLongGap: false, gapSeverity: null },
    ...stops.map((poi) => {
      const routeMeters = poi.routeKm * 1000;
      const distanceFromPreviousM = Math.max(0, routeMeters - previousMeters);
      previousMeters = routeMeters;
      const gapSeverity = severity.classify(distanceFromPreviousM);
      return {
        kind: 'stop',
        poi,
        routeMeters,
        distanceFromPreviousM,
        gapSeverity,
        isLongGap: gapSeverity === 'critical',
      };
    }),
  ];

  const distanceToFinishM = Math.max(0, routeDistanceMeters - previousMeters);
  const finishSeverity = severity.classify(distanceToFinishM);
  entries.push({
    kind: 'finish',
    name: 'Finish',
    routeMeters: routeDistanceMeters,
    distanceFromPreviousM: distanceToFinishM,
    gapSeverity: finishSeverity,
    isLongGap: finishSeverity === 'critical',
  });

  return {
    entries,
    stops,
    longestGapM: Math.max(...entries.slice(1).map((entry) => entry.distanceFromPreviousM)),
    warningThresholdM: severity.thresholdM,
    gapSettings: severity.settings || null,
    gapThresholds: severity.thresholds || null,
  };
}

function buildGapWarnings(pois, selectedPoiIds, routeDistanceMeters, gapConfig = ROUTEBOOK_GAP_WARNING_M) {
  const routebook = buildRoutebook(pois, selectedPoiIds, routeDistanceMeters, gapConfig);
  const warnings = routebook.entries.slice(1)
    .map((entry, index) => ({ entry, previous: routebook.entries[index] }))
    .filter(({ entry }) => entry.gapSeverity)
    .map(({ entry, previous }) => ({
      from: previous.kind === 'stop' ? previous.poi.name : 'Start',
      to: entry.kind === 'stop' ? entry.poi.name : 'Ziel',
      startMeters: previous.routeMeters,
      endMeters: entry.routeMeters,
      lengthM: entry.distanceFromPreviousM,
      severity: entry.gapSeverity,
    }));
  return {
    warnings,
    longestGapM: routebook.longestGapM,
    routebook,
    warningThresholdM: routebook.warningThresholdM,
    gapSettings: routebook.gapSettings,
    gapThresholds: routebook.gapThresholds,
  };
}

export function buildRoutebookWarnings(pois, selectedPoiIds, routeDistanceMeters, gapConfig = ROUTEBOOK_GAP_WARNING_M) {
  return buildGapWarnings(pois, selectedPoiIds, routeDistanceMeters, gapConfig);
}

export function buildFoundPoiWarnings(pois, routeDistanceMeters, gapConfig = ROUTEBOOK_GAP_WARNING_M) {
  const severity = gapClassifier(gapConfig);
  const found = pois.filter((poi) => poi.status !== 'near-miss').sort((a, b) => a.routeKm - b.routeKm);
  const points = [{ name: 'Start', routeMeters: 0 }, ...found.map((poi) => ({ name: poi.name, routeMeters: poi.routeKm * 1000 })), { name: 'Ziel', routeMeters: routeDistanceMeters }];
  const warnings = points.slice(1).map((to, index) => {
    const from = points[index];
    const lengthM = Math.max(0, to.routeMeters - from.routeMeters);
    return {
      from: from.name,
      to: to.name,
      startMeters: from.routeMeters,
      endMeters: to.routeMeters,
      lengthM,
      severity: severity.classify(lengthM),
    };
  }).filter((warning) => warning.severity);
  return {
    warnings,
    longestGapM: Math.max(0, ...points.slice(1).map((to, index) => to.routeMeters - points[index].routeMeters)),
    foundCount: found.length,
    warningThresholdM: severity.thresholdM,
    gapSettings: severity.settings || null,
    gapThresholds: severity.thresholds || null,
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
