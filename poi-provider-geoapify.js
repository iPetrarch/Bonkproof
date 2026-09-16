const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const GEOAPIFY_PROXY_URL = './api/places.php';
const GEOAPIFY_TIMEOUT_MS = 12_000;

export const GEOAPIFY_RULES = [
  { id: 'supermarket', needles: ['["shop"="supermarket"]'], categories: ['commercial.supermarket'], tags: { shop: 'supermarket' } },
  { id: 'convenience', needles: ['["shop"="convenience"]', '["shop"="kiosk"]'], categories: ['commercial.convenience', 'commercial.kiosk'], tags: { shop: 'convenience' } },
  { id: 'fuel', needles: ['["amenity"="fuel"]'], categories: ['service.vehicle.fuel'], tags: { amenity: 'fuel' } },
  { id: 'bakery', needles: ['["shop"="bakery"]'], categories: ['commercial.food_and_drink.bakery'], tags: { shop: 'bakery' } },
  { id: 'cafe', needles: ['["amenity"="cafe"]'], categories: ['catering.cafe'], tags: { amenity: 'cafe' } },
  { id: 'fast_food', needles: ['["amenity"="fast_food"]'], categories: ['catering.fast_food'], tags: { amenity: 'fast_food' } },
  { id: 'restaurant', needles: ['["amenity"="restaurant"]'], categories: ['catering.restaurant'], tags: { amenity: 'restaurant' } },
  { id: 'drinking_water', needles: ['["amenity"="drinking_water"]'], categories: ['amenity.drinking_water'], tags: { amenity: 'drinking_water' } },
  { id: 'toilets', needles: ['["amenity"="toilets"]'], categories: ['amenity.toilet'], tags: { amenity: 'toilets' } },
  { id: 'pharmacy', needles: ['["amenity"="pharmacy"]'], categories: ['healthcare.pharmacy'], tags: { amenity: 'pharmacy' } },
  { id: 'atm', needles: ['["amenity"="atm"]'], categories: ['service.financial.atm'], tags: { amenity: 'atm' } },
  { id: 'bicycle_shop', needles: ['["shop"="bicycle"]'], categories: ['commercial.outdoor_and_sport.bicycle'], tags: { shop: 'bicycle' } },
  { id: 'railway', needles: ['["railway"="station"]', '["railway"="halt"]'], categories: ['public_transport.train'], tags: { railway: 'station' } },
  { id: 'ferry', needles: ['["amenity"="ferry_terminal"]'], categories: ['public_transport.ferry'], tags: { amenity: 'ferry_terminal' } },
  { id: 'parcel_locker', needles: ['["amenity"="parcel_locker"]'], categories: ['service.post.parcel_locker'], tags: { amenity: 'parcel_locker' } },
  { id: 'accommodation', needles: ['["tourism"="hotel"]', '["tourism"="guest_house"]'], categories: ['accommodation.hotel', 'accommodation.guest_house'], tags: { tourism: 'hotel' } },
  { id: 'campsite', needles: ['["tourism"="camp_site"]'], categories: ['camping.camp_site'], tags: { tourism: 'camp_site' } },
  { id: 'shelter', needles: ['["amenity"="shelter"]'], categories: ['service.social_facility.shelter'], tags: { amenity: 'shelter' } },
  { id: 'hospital', needles: ['["amenity"="hospital"]'], categories: ['healthcare.hospital'], tags: { amenity: 'hospital' } },
  { id: 'doctor', needles: ['["amenity"="doctors"]'], categories: ['healthcare.clinic_or_praxis'], tags: { amenity: 'doctors' } },
];

const UNSUPPORTED_SPECIAL_SELECTORS = [
  '["brand"="DHL Packstation"]',
  '["operator"="DHL"]',
  '["brand"="Amazon Locker"]',
  '["operator"="Amazon"]',
  '["amenity"="bicycle_repair_station"]',
  '["landuse"="cemetery"]',
  '["amenity"="grave_yard"]',
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
  return GEOAPIFY_RULES.find((rule) => rule.needles.some((needle) => statement.includes(needle))) || null;
}

export function resolveGeoapifyRules(query) {
  const text = String(query || '');
  if (UNSUPPORTED_SPECIAL_SELECTORS.some((selector) => text.includes(selector))) return null;
  const statements = [...text.matchAll(/nwr([^;]+);/g)].map((match) => match[1]);
  if (statements.length === 0) return null;
  const rules = statements.map(ruleForStatement);
  if (rules.some((rule) => !rule)) return null;
  return [...new Map(rules.map((rule) => [rule.id, rule])).values()];
}

function featureMatchesRule(feature, rule) {
  const categories = Array.isArray(feature?.properties?.categories) ? feature.properties.categories : [];
  return rule.categories.some((wanted) => categories.some((actual) => actual === wanted || actual.startsWith(`${wanted}.`)));
}

export function geoapifyFeatureToElement(feature, rules) {
  const rule = rules.find((candidate) => featureMatchesRule(feature, candidate));
  if (!rule) return null;
  const properties = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates || [];
  const lon = Number(properties.lon ?? coordinates[0]);
  const lat = Number(properties.lat ?? coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const placeId = String(properties.place_id || `${lon}:${lat}:${properties.name || rule.id}`);
  const tags = {
    ...rule.tags,
    ...(properties.name ? { name: properties.name } : {}),
    ...(properties.brand ? { brand: properties.brand } : {}),
    ...(properties.operator ? { operator: properties.operator } : {}),
    source: 'geoapify',
  };
  return { type: 'geoapify', id: placeId, lat, lon, tags };
}

async function fetchGeoapifyElements(originalFetch, query, signal) {
  const bbox = extractOverpassBbox(query);
  const rules = resolveGeoapifyRules(query);
  if (!bbox || !rules?.length) return null;

  const categories = [...new Set(rules.flatMap((rule) => rule.categories))];
  const url = new URL(GEOAPIFY_PROXY_URL, window.location.href);
  url.searchParams.set('categories', categories.join(','));
  url.searchParams.set('west', String(bbox.west));
  url.searchParams.set('south', String(bbox.south));
  url.searchParams.set('east', String(bbox.east));
  url.searchParams.set('north', String(bbox.north));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEOAPIFY_TIMEOUT_MS);
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
    const features = Array.isArray(payload?.features) ? payload.features : [];
    return features.map((feature) => geoapifyFeatureToElement(feature, rules)).filter(Boolean);
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn('Geoapify POI provider unavailable; falling back to Overpass.', error);
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

export function installGeoapifyFetchBridge(target = globalThis) {
  if (!target?.fetch || target.__bonkproofGeoapifyBridgeInstalled) return;
  const originalFetch = target.fetch.bind(target);
  target.__bonkproofGeoapifyBridgeInstalled = true;
  target.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (url !== OVERPASS_URL || String(init?.method || 'GET').toUpperCase() !== 'POST') {
      return originalFetch(input, init);
    }

    const query = overpassBodyData(init.body);
    const elements = await fetchGeoapifyElements(originalFetch, query, init.signal);
    if (elements === null) return originalFetch(input, init);

    return new Response(JSON.stringify({ elements }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Bonkproof-POI-Provider': 'geoapify',
      },
    });
  };
}

if (typeof window !== 'undefined') installGeoapifyFetchBridge(window);
