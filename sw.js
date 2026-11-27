// Regenerate the integrity table with node scripts/update-app-shell.mjs after changing app assets.
/* BEGIN APP SHELL */
const RELEASE = '53154471002c1748bdcf135b';
const SHELL = {
  "index.html": "d6a83d8264dc003aba1b4260c973544bc77bff58b1ac55c781782aacfc5bd976",
  "impressum.html": "e46e168d593a3668ba44533859b876a4478d25c980bf4568c3a3236d475b9140",
  "datenschutz.html": "573c2033b298b604fbb192ed544e87818748b3be27b7e6c6ee03bf456dc4be54",
  "styles.css": "25bd992910b2e3a98cde222631bf0303f497023923fa5e5b8a2cade4cd742fa0",
  "app.js": "24b8c2a655d4274486d5c6702fc978050680da9181185c01f3287b96d728e9be",
  "export-model.js": "56628a2e154035cc5ed592e5f789ca3d28c80e5a03f0c6c035ac5eb7bebebb28",
  "export-core.js": "f8497d9687ecedf6901b9442dcc77e4558ef6f27fc6927c8f70304f6d4440149",
  "export-profiles.js": "6926ab62616226639fdff57af4527b8077bd746f0370283f6f0d664d02c51e29",
  "export-gap-warnings.js": "d285166299880a186f90d7b2a5f11fd1aea55e2dcb11e6a8f247585272070997",
  "routebook.js": "03ade9e21132db0bf125d5d003a75166e45832d378a88eedb1811181d5840d1f",
  "poi-search.js": "fa59fdaa3224c91eeb9b018c959ec5b6651b304c01b0a0553a1a6448e24ddc19",
  "poi-projection.js": "132bc14eaa11219efa24f0051b9bf790a9a2e263fc0587b89c5603975fd91868",
  "poi-pass-index.js": "f3dd095c00638c27cf5778ebefab09e9d22c3228f77690f6fde7e7a8ea5ee6ca",
  "poi-clustering.js": "3759897915798ca2db563fa8e15254116c4e3ba848a5e4172fd0fa9f963660d4",
  "project-format.js": "6d9b3f59f91e51603397ea5e99ffd88212b0312a892444138542fe45e51b793b",
  "project-store.js": "28019a42e8172c9fbf9b5cdd9f0da57d08f2c81e0c4ab5bd1e824b3bb90a1974",
  "project-workspace.js": "c2c3b1f76282727cb7e356c86b33c803f1a1dda1b1856998db7f6894393d1b2f",
  "poi-config.js": "07cf7f99b54bef40368c7d3f9b48419ebec528eca8ede4e541f7a9029a89c671",
  "poi-provider-overture.js": "caf3a68e0613ddbf8c826531f2d85b5d2f0793bfb8b5848ffd0d9a21f124ca86",
  "resupply-profile.js": "c016b4ec94756b5da0fd21550078202655817e67ff88a446f1479770d364aead",
  "config/poi-categories.json": "2387e816b67987668498fe36bc6ba808176b95321708105f88b302d80bfa0b3c",
  "config/resupply-profile.json": "39720469d3f3e8a9400ee34a5d986e8197fe1db21b566d125af834cc31262c4f",
  "vendor/leaflet/leaflet.js": "db49d009c841f5ca34a888c96511ae936fd9f5533e90d8b2c4d57596f4e5641a",
  "vendor/leaflet/leaflet.css": "337bfca5cabd03b39815b2700febe2b3b7edf55921c59cd49f88ecb328212303",
  "vendor/leaflet/LICENSE": "bbc959aaef7488b38942e7f05cfd1244351f8bce54261951ea17dd7cf60f894b",
  "vendor/leaflet/images/layers.png": "1dbbe9d028e292f36fcba8f8b3a28d5e8932754fc2215b9ac69e4cdecf5107c6",
  "vendor/leaflet/images/layers-2x.png": "066daca850d8ffbef007af00b06eac0015728dee279c51f3cb6c716df7c42edf",
  "vendor/leaflet/images/marker-icon.png": "574c3a5cca85f4114085b6841596d62f00d7c892c7b03f28cbfa301deb1dc437",
  "vendor/leaflet/images/marker-icon-2x.png": "00179c4c1ee830d3a108412ae0d294f55776cfeb085c60129a39aa6fc4ae2528",
  "vendor/leaflet/images/marker-shadow.png": "264f5c640339f042dd729062cfc04c17f8ea0f29882b538e3848ed8f10edb4da",
  "manifest.json": "092ec18a3f3bdec15b8b519b0f808056f789de1f6f8935a3c93106fbbed75370",
  "pwa.js": "fcf8ca4c9644a0dcf60a2414bc488c3d62848b3429c560691b8dc0c7f6d84a40",
  "icons/bonkproof-192.png": "daccb8144e91bdc4fc8fa216034a3034ce753b12dc6712892ae03f1f6b9d3471",
  "icons/bonkproof-512.png": "58a7ea2385de17cbd18e3930c50424dcb34db97744d63663a5e94cbc6f025cd7",
  "icons/apple-touch-icon.png": "dd489cb149551007ac02106ece4c3f71ea18135b5a4150ab7429d3d70eda1cf5"
};
/* END APP SHELL */

const scope = self.registration.scope;
const prefix = `bonkproof-shell:${scope}:`;
const cacheName = prefix + RELEASE;
const assets = new Map(Object.entries(SHELL).map(([path, hash]) => [new URL(path, scope).href, hash]));
const entry = new URL('index.html', scope).href;
const completion = new URL('.bonkproof-cache-ready', scope).href;

const typesByExtension = {
  js: ['text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript'],
  css: ['text/css'],
  html: ['text/html'],
  json: ['application/json', 'application/manifest+json'],
  png: ['image/png'],
};

function hasExpectedType(url, response) {
  const extension = new URL(url).pathname.split('.').at(-1);
  const allowed = typesByExtension[extension];
  const mime = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  return !allowed || allowed.includes(mime);
}

async function matchesHash(response, hash) {
  const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('') === hash;
}

async function cacheReady() {
  const cache = await caches.open(cacheName);
  if (!await cache.match(completion)) return false;
  const keys = new Set((await cache.keys()).map(({ url }) => url));
  return [...assets.keys()].every((url) => keys.has(url));
}

async function prepareShell() {
  if (await cacheReady()) return;
  const cache = await caches.open(cacheName);
  for (const [url, hash] of assets) {
    if (await cache.match(url)) continue;
    const response = await fetch(url, { cache: 'reload', redirect: 'error' });
    if (!response.ok || response.type === 'opaque' || !hasExpectedType(url, response) || !await matchesHash(response, hash)) {
      throw new Error(`Bonkproof resource mismatch: ${url}`);
    }
    await cache.put(url, response);
  }
  await cache.put(completion, new Response(RELEASE));
}

self.addEventListener('install', (event) => {
  event.waitUntil(prepareShell().catch(async (error) => {
    await caches.delete(cacheName);
    throw error;
  }));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(prefix) && key !== cacheName).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const destination = new URL(event.request.url);
  if (event.request.mode === 'navigate') destination.search = '';
  const key = destination.href === scope && event.request.mode === 'navigate' ? entry : destination.href;
  if (!assets.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const saved = await cache.match(key);
    if (saved) return saved;

    // Repair a missing entry only if it still belongs to this exact release.
    try {
      const response = await fetch(key, { cache: 'reload', redirect: 'error' });
      if (response.ok && hasExpectedType(key, response) && await matchesHash(response, assets.get(key))) {
        await cache.put(key, response.clone());
        return response;
      }
    } catch {
      // Browsers may partially evict caches, including when offline.
    }
    // Let the browser surface failure without falling back to a mismatched release.
    return Response.error();
  })());
});

self.addEventListener('message', (event) => {
  const reply = event.ports[0];
  if (event.data === 'CHECK_SHELL' && reply) {
    event.waitUntil(cacheReady().then((ready) => reply.postMessage({ ready, release: RELEASE })).catch(() => reply.postMessage({ ready: false })));
  }
  if (event.data === 'PREPARE_SHELL' && reply) {
    event.waitUntil(prepareShell().then(() => reply.postMessage({ ready: true })).catch(() => reply.postMessage({ ready: false })));
  }
  if (event.data === 'ACTIVATE_UPDATE' && reply && event.source) {
    event.waitUntil((async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const appWindows = windows.filter((client) => client.url.startsWith(scope));
      if (appWindows.length !== 1 || appWindows[0].id !== event.source.id) {
        reply.postMessage({ blocked: true });
        return;
      }
      if (!await cacheReady()) {
        reply.postMessage({ unavailable: true });
        return;
      }
      reply.postMessage({ accepted: true });
      await self.skipWaiting();
    })().catch(() => reply.postMessage({ unavailable: true })));
  }
});
