export const TRACKKIN_HANDOFF_SCHEMA = 'bonkproof-trackkin-handoff/v1';

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite.`);
  return number;
}

function selectedStops(routePoints = []) {
  return routePoints.filter((point) => point?.selected).slice()
    .sort((a, b) => finiteNumber(a.routeKm, 'routeKm') - finiteNumber(b.routeKm, 'routeKm'));
}

export function buildTrackKinHandoff(input, options = {}) {
  const sourceGpx = input?.sourceGpx;
  if (typeof sourceGpx !== 'string' || !sourceGpx.trim()) throw new TypeError('Original GPX source is required for TrackKin handoff.');
  const routeDistanceMeters = Math.round(finiteNumber(input?.routeDistanceMeters, 'routeDistanceMeters'));
  if (routeDistanceMeters <= 0) throw new RangeError('Route distance must be greater than zero.');

  const usedRouteMeters = new Set();
  const routebook = [];
  const sourceStops = [];
  selectedStops(input?.routePoints).forEach((point, index) => {
    const routeDistanceM = Math.round(finiteNumber(point.routeKm, 'routeKm') * 1000);
    if (routeDistanceM < 0 || routeDistanceM > routeDistanceMeters) throw new RangeError('Selected stop is outside the loaded route.');
    if (usedRouteMeters.has(routeDistanceM)) throw new RangeError('Two selected stops resolve to the same route metre, which TrackKin cannot currently import.');
    usedRouteMeters.add(routeDistanceM);
    const name = String(point.name || point.categoryLabel || 'Bonkproof stop').trim();
    if (!name) throw new TypeError('Selected stop requires a name.');

    routebook.push({ name, route_distance_km: routeDistanceM / 1000, planned_break_minutes: 0 });
    sourceStops.push({
      routebook_index: index,
      source_id: String(point.id || ''),
      lat: finiteNumber(point.lat, 'lat'),
      lon: finiteNumber(point.lon, 'lon'),
      route_distance_m: routeDistanceM,
      category_id: point.categoryId || null,
      category_label: point.categoryLabel || null,
      description: point.description || '',
      source_identity: point.sourceIdentity || null,
      pass_identity: point.passIdentity || null,
    });
  });

  return {
    schema: TRACKKIN_HANDOFF_SCHEMA,
    created_at: options.createdAt || new Date().toISOString(),
    source: 'bonkproof',
    route: {
      name: String(input.routeName || input.fileName || 'Bonkproof route').trim(),
      file_name: String(input.fileName || 'route.gpx'),
      distance_m: routeDistanceMeters,
      gpx_text: sourceGpx,
    },
    routebook,
    source_stops: sourceStops,
  };
}

export async function sendTrackKinHandoff(endpoint, payload, options = {}) {
  if (typeof endpoint !== 'string' || !endpoint.trim()) throw new TypeError('TrackKin endpoint is required.');
  if (payload?.schema !== TRACKKIN_HANDOFF_SCHEMA) throw new TypeError('Unsupported TrackKin handoff payload.');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch is required for TrackKin handoff.');
  const response = await fetchImpl(endpoint, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload),
  });
  let result = null;
  try { result = await response.json(); } catch { result = null; }
  if (!response.ok || result?.ok !== true) {
    const error = new Error(result?.error || `TrackKin import failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return result;
}
