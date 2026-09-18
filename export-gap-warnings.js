import { buildRoutebookWarnings } from './routebook.js';

function haversineMeters(a, b) {
  const earthRadius = 6371008.8;
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(Number(b.lat) - Number(a.lat));
  const dLon = toRad(Number(b.lon) - Number(a.lon));
  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function interpolatePoint(a, b, fraction) {
  return {
    lat: Number(a.lat) + (Number(b.lat) - Number(a.lat)) * fraction,
    lon: Number(a.lon) + (Number(b.lon) - Number(a.lon)) * fraction,
  };
}

export function routeCoordinateAtDistance(parsedRoute, distanceM) {
  const segments = parsedRoute?.segments?.filter((segment) => Array.isArray(segment) && segment.length) || [];
  if (segments.length === 0) return null;

  const target = Math.max(0, Number(distanceM) || 0);
  let cumulative = 0;

  for (const segment of segments) {
    if (segment.length === 1) {
      if (target <= cumulative) return { lat: Number(segment[0].lat), lon: Number(segment[0].lon), routeMeters: cumulative };
      continue;
    }

    for (let index = 0; index < segment.length - 1; index += 1) {
      const a = segment[index];
      const b = segment[index + 1];
      const length = haversineMeters(a, b);
      const next = cumulative + length;
      if (target <= next || length === 0) {
        const fraction = length > 0 ? Math.max(0, Math.min(1, (target - cumulative) / length)) : 0;
        return { ...interpolatePoint(a, b, fraction), routeMeters: Math.min(target, next) };
      }
      cumulative = next;
    }
  }

  const lastSegment = segments.at(-1);
  const last = lastSegment.at(-1);
  return { lat: Number(last.lat), lon: Number(last.lon), routeMeters: cumulative };
}

export function buildCriticalGapExportPoints({
  parsedRoute,
  pois,
  selectedPoiIds,
  routeDistanceMeters,
  gapSettings,
  enabled = false,
  leadMeters = 1,
} = {}) {
  if (!enabled) return [];

  const warnings = buildRoutebookWarnings(
    pois || [],
    selectedPoiIds || new Set(),
    Number(routeDistanceMeters) || 0,
    gapSettings,
  ).warnings.filter((warning) => warning.severity === 'critical');

  return warnings.map((warning, index) => {
    const warningRouteMeters = Math.max(0, warning.startMeters - Math.max(0, Number(leadMeters) || 0));
    const coordinate = routeCoordinateAtDistance(parsedRoute, warningRouteMeters);
    if (!coordinate) return null;
    const roundedKm = Math.max(1, Math.round(warning.lengthM / 1000));
    return {
      id: `bonkproof-gap:${warning.startMeters}:${warning.endMeters}:${index}`,
      name: `${roundedKm} km supply gap`,
      description: `Critical supply gap: ${warning.from} → ${warning.to} · ${(warning.lengthM / 1000).toFixed(1)} km`,
      lat: coordinate.lat,
      lon: coordinate.lon,
      routeKm: coordinate.routeMeters / 1000,
      offRouteM: 0,
      categoryId: 'supply_gap_warning',
      categoryLabel: 'Supply gap warning',
      status: 'export-warning',
      selected: false,
      pinned: false,
      exportOnly: true,
      sourceIdentity: {
        provider: 'bonkproof',
        type: 'supply-gap-warning',
        id: `gap:${warning.startMeters}:${warning.endMeters}`,
      },
      passIdentity: null,
      warning: { ...warning },
    };
  }).filter(Boolean);
}
