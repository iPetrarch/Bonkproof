const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERTURE_API_URL = './api/places.php';
const OVERTURE_TIMEOUT_MS = 4_000;

export const OVERTURE_RULES = [
  { id: 'supermarket', needles: ['["shop"="supermarket"]'], tags: { shop: 'supermarket' } },
  { id: 'convenience', needles: ['["shop"="convenience"]', '["shop"="kiosk"]'], tags: { shop: 'convenience' } },
  { id: 'fuel', needles: ['["amenity"="fuel"]'], tags: { amenity: 'fuel' } },
  { id: 'bakery', needles: ['["shop"="bakery"]'], tags: { shop: 'bakery' } },
  { id: 'cafe', needles: ['["amenity"="cafe"]'], tags: { amenity: 'cafe' } },
  { id: 'fast_food', needles: ['["amenity"="fast_food"]'], tags: { amenity: 'fast_food' } },
  { id: 'restaurant', needles: ['["amenity"="restaurant"]'], tags: { amenity: 'restaurant' } },
  { id: 'drinking_water', needles: ['["amenity"="drinking_water"]'], tags: { amenity: 'drinking_water' } },
  { id: 'toilets', needles: ['["amenity"="toilets"]'], tags: { amenity: 'toilets' } },
  { id: 'pharmacy', needles: ['["amenity"="pharmacy"]'], tags: { amenity: 'pharmacy' } },
  { id: 'atm', needles: ['["amenity"="atm"]'], tags: { amenity: 'atm' } },
  { id: 'bicycle_shop', needles: ['["shop"="bicycle"]'], tags: { shop: 'bicycle' } },
  { id: 'bicycle_repair_station', needles: ['["amenity"="bicycle_repair_station"]'], tags: { amenity: 'bicycle_repair_station' } },
  { id: 'railway', needles: ['["railway"="station"]', '["railway"="halt"]'], tags: { railway: 'station' } },
  { id: 'ferry', needles: ['["amenity"="ferry_terminal"]'], tags: { amenity: 'ferry_terminal' } },
  { id: 'parcel_locker', needles: ['["amenity"="parcel_locker"]'], tags: { amenity: 'parcel_locker' } },
  { id: 'accommodation', needles: ['["tourism"="hotel"]', '["tourism"="guest_house"]'], tags: { tourism: 'hotel' } },
  { id: 'campsite', needles: ['["tourism"="camp_site"]'], tags: { tourism: 'camp_site' } },
  { id: 'shelter', needles: ['["amenity"="shelter"]'], tags: { amenity: 'shelter' } },
  { id: 'hospital', needles: ['["amenity"="hospital"]'], tags: { amenity: 'hospital' } },
  { id: 'doctor', needles: ['["amenity"="doctors"]'], tags: { amenity: 'doctors' } },
  { id: 'cemetery', needles: ['["landuse"="cemetery"]', '["amenity"="grave_yard"]'], tags: { landuse: 'cemetery' } },
];

const UNSUPPORTED_SPECIAL_SELECTORS = [
  '["brand"="DHL Packstation"]',
  '["operator"="DHL"]',
  '["brand"="Amazon Locker"]',
  '["operator"="Amazon"]',
];

function overpassBodyData(body) {
  if (body instanceof URLSearchParams) return body.get('data') || '';
  if (typeof body === 'string') return new URLSearchParams(body).get('data') || '';
  return '';
}

export function extractOverpassBbox(query) {
  const match = String(query || '').match(/\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/);
  if (!match) return null;
  const [, south, west, north, east] = match.map(Number);
  if (![south, west, north, east].every(Number.isFinite)) return null;
  return { south, west, north, east };
}

function ruleForStatement(statement) {
  return OVERTURE_RULES.find((rule) => rule.needles.some((needle) => statement.includes(needle))) || null;
}

export function resolveOvertureRules(query) {
  const text = String(query || '');
  if (UNSUPPORTED_SPECIAL_SELECTORS.some((selector) => text.includes(selector))) return null;
  const statements = [...text.matchAll(/nwr([^;]+);/g)].map((match) => match[1]);
  if (statements.length === 0) return null;
  const rules = statements.map(ruleForStatement);
  if (rules.some((rule) => !rule)) return null;
  return [...new Map(rules.map((rule) => [rule.id, rule])).values()];
}

export function overturePlaceToElement(place, rules) {
  const rule = rules.find((candidate) => candidate.id === place?.category);
  if (!rule) return null;
  const lat = Number(place?.lat);
  const lon = Number(place?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const id = String(place?.id || `${lon}:${lat}:${place?.name || rule.id}`);
  return {
    type: 'overture',
    id,
    lat,
    lon,
    tags: {
      ...rule.tags,
      ...(place?.name ? { name: place.name } : {}),
      source: 'overture',
    },
  };
}

async function fetchOvertureElements(originalFetch, query, signal) {
  const bbox = extractOverpassBbox(query);
  const rules = resolveOvertureRules(query);
  if (!bbox || !rules?.length) return null;

  const url = new URL(OVERTURE_API_URL, window.location.href);
  url.searchParams.set('categories', rules.map((rule) => rule.id).join(','));
  url.searchParams.set('west', String(bbox.west));
  url.searchParams.set('south', String(bbox.south));
  url.searchParams.set('east', String(bbox.east));
  url.searchParams.set('north', String(bbox.north));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OVERTURE_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });
  try {
    const response = await originalFetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const places = Array.isArray(payload?.places) ? payload.places : [];
    return places.map((place) => overturePlaceToElement(place, rules)).filter(Boolean);
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn('Local Overture POI provider unavailable; falling back to Overpass.', error);
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

export function installOvertureFetchBridge(target = globalThis) {
  if (!target?.fetch || target.__bonkproofOvertureBridgeInstalled) return;
  const originalFetch = target.fetch.bind(target);
  target.__bonkproofOvertureBridgeInstalled = true;
  target.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (url !== OVERPASS_URL || String(init?.method || 'GET').toUpperCase() !== 'POST') {
      return originalFetch(input, init);
    }

    const query = overpassBodyData(init.body);
    const elements = await fetchOvertureElements(originalFetch, query, init.signal);
    if (elements === null) return originalFetch(input, init);

    return new Response(JSON.stringify({ elements }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Bonkproof-POI-Provider': 'overture-local',
      },
    });
  };
}

if (typeof window !== 'undefined') installOvertureFetchBridge(window);
