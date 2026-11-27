// Real HTTP scope and browser storage. External network traffic is intercepted.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const root = path.resolve(__dirname, '..');
const basePath = '/bonkproof/';
const mime = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.json': 'application/json', '.png': 'image/png',
};
const poi = { id: 'market', name: 'Testmarkt', category: 'supermarket', lat: 52, lon: 9.23 };
const lons = Array.from({ length: 26 }, (_, index) => 9 + index * .024);
const gpx = '<gpx><trk><name>Offline-Route</name><trkseg>'
  + [...lons, ...lons.slice(0, -1).reverse()].map((lon) => `<trkpt lat="52" lon="${lon}"/>`).join('')
  + '</trkseg></trk></gpx>';

async function startServer() {
  const entry = await readFile(path.join(root, 'index.html'), 'utf8');
  const originalWorker = await readFile(path.join(root, 'sw.js'), 'utf8');
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const files = JSON.parse(originalWorker.match(/const SHELL = ({[\s\S]*?});/)[1]);
  const state = { release: 1, damagedPath: '', mixedBytes: false, simulatedOffline: false, providerMode: 'good', apiCalls: 0, scopeVisits: 0 };
  const server = createServer(async (request, response) => {
    if (state.simulatedOffline) { response.destroy(); return; }
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith(basePath)) {
      response.writeHead(404).end();
      return;
    }
    if (url.pathname === basePath) state.scopeVisits += 1;
    const file = url.pathname.slice(basePath.length) || 'index.html';
    if (file === 'api/places.php') {
      state.apiCalls += 1;
      if (state.providerMode === 'error') response.writeHead(503).end();
      else {
        const p = url.searchParams;
        const places = p.get('categories').split(',').includes(poi.category)
          && +p.get('west') <= poi.lon && +p.get('east') >= poi.lon
          && +p.get('south') <= poi.lat && +p.get('north') >= poi.lat ? [poi] : [];
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ places }));
      }
      return;
    }
    if (file === state.damagedPath) {
      if (state.mixedBytes) response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"oldRelease":true}');
      else response.writeHead(503).end();
      return;
    }
    const html = entry.replace('<title>', `<meta name="test-release" content="${state.release}"><title>`);
    const worker = originalWorker
      .replace(/const RELEASE = '[^']+';/, `const RELEASE = 'test-${state.release}';`)
      .replace(files['index.html'], digest(html));
    try {
      if (!Object.hasOwn(files, file) && file !== 'sw.js') throw new Error('Unknown static file');
      const body = file === 'index.html' ? html : file === 'sw.js' ? worker : await readFile(path.join(root, file));
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': mime[path.extname(file)] || 'text/plain' }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}${basePath}`, files, state,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function createContext(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 820 }, acceptDownloads: true });
  await context.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await context.route('https://overpass-api.de/**', (route) => route.abort());
  if (process.env.BROWSER_ENGINE === 'webkit') {
    await context.addInitScript(() => {
      const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine').get;
      Object.defineProperty(navigator, 'onLine', {
        get: () => sessionStorage.getItem('test-offline') !== 'yes' && original.call(navigator),
      });
    });
  }
  return context;
}

async function setOffline(context, server, offline) {
  if (process.env.BROWSER_ENGINE === 'webkit') {
    // WPE's protocol offline toggle aborts top-level navigations before the worker can respond.
    server.state.simulatedOffline = offline;
    for (const page of context.pages()) {
      await page.evaluate((value) => {
        sessionStorage.setItem('test-offline', value ? 'yes' : 'no');
        window.dispatchEvent(new Event(value ? 'offline' : 'online'));
      }, offline);
    }
  } else await context.setOffline(offline);
}

const status = (page, id, text) => page.waitForFunction(([selector, expected]) =>
  document.querySelector(selector).textContent.includes(expected), [id, text]);
const saved = (page) => status(page, '[data-project=summary]', 'Gespeichert');
const prepared = (page) => status(page, '#pwa-cache-status', 'Offline-Anwendung verfügbar');
const release = (page) => page.locator('meta[name=test-release]').getAttribute('content');

async function checkCache(page, server, version) {
  const inventory = await page.evaluate(async ({ url, version }) => {
    const registration = await navigator.serviceWorker.ready;
    const cacheName = `bonkproof-shell:${url}:test-${version}`;
    const cache = await caches.open(cacheName);
    return { scope: registration.scope, keys: (await cache.keys()).map((request) => request.url) };
  }, { url: server.url, version });
  assert.equal(inventory.scope, server.url);
  const expected = [...Object.keys(server.files), '.bonkproof-cache-ready'].map((name) => server.url + name);
  assert.deepEqual(inventory.keys.toSorted(), expected.toSorted());
  assert.ok(inventory.keys.every((url) => !url.includes('/api/') && !url.includes('tile.openstreetmap')));
}

async function failedInstall(browser, server) {
  const context = await createContext(browser, 360);
  try {
    server.state.damagedPath = 'config/resupply-profile.json';
    const page = await context.newPage();
    await page.goto(server.url);
    await page.locator('#pwa-prepare').waitFor();
    assert.equal(await page.evaluate(() => navigator.serviceWorker.controller === null), true);
    assert.deepEqual(await page.evaluate(() => caches.keys()), []);
    server.state.damagedPath = '';
    await page.locator('#pwa-prepare').click();
    await prepared(page);
    await checkCache(page, server, 1);
  } finally {
    server.state.damagedPath = '';
    server.state.mixedBytes = false;
    server.state.simulatedOffline = false;
    await context.close();
  }
}

async function checkPlanning(browser, server, width, includeUpdate) {
  const context = await createContext(browser, width);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(server.url);
    await prepared(page);
    await checkCache(page, server, 1);
    await page.locator('#gpx-file').setInputFiles({
      name: 'offline.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx),
    });
    await status(page, '#poi-status', 'vollständig geladen');
    assert.equal(await page.locator('#poi-list .poi-list-item').count(), 2);
    await page.locator('[data-project=name]').fill('Offline Tour');
    await page.locator('[data-project=save]').click();
    await saved(page);

    // WebKit/WPE in the Cloud has unreliable timing for intercepted external fetch cancellation.
    if (process.env.BROWSER_ENGINE !== 'webkit') {
      // Try a search with navigator.onLine still true but no reachable provider.
      server.state.providerMode = 'error';
      await page.locator('#reload-pois').click();
      await page.waitForFunction(() => /Verbindung zum POI-Dienst fehlgeschlagen|POI-Dienst meldet einen Fehler/.test(
        document.querySelector('#poi-connection-status').textContent,
      ), null, { timeout: 30000 }).catch(async (error) => {
        console.error('Provider scenario status:', await page.locator('#poi-status').textContent(),
          await page.locator('#poi-connection-status').textContent(), 'API calls:', server.state.apiCalls);
        throw error;
      });
      await status(page, '#poi-status', 'lokale Planungsstand bleibt erhalten');
      assert.equal(await page.locator('#poi-list .poi-list-item').count(), 2);
      await saved(page);
      server.state.providerMode = 'good';
    }

    const calls = server.state.apiCalls;
    await setOffline(context, server, true);
    await page.reload();
    await prepared(page);
    await status(page, '#poi-status', 'Lokaler Planungsstand geladen');
    await status(page, '#connection-status', 'Offline');
    await status(page, '#map-background-status', 'Hintergrundkarte nicht verfügbar');
    assert.equal(await page.locator('#reload-pois').isDisabled(), true);
    assert.equal(await page.locator('#map.map-offline .leaflet-overlay-pane canvas').count(), 1);
    assert.equal(await page.locator('#poi-list .poi-list-item').count(), 2);

    const first = page.locator('#poi-list .poi-list-item').first();
    const passId = await first.getAttribute('data-poi-id');
    await first.locator('.poi-selection').click();
    await first.locator('.poi-pin').click();
    await page.locator('#routebook-tab').click();
    await page.locator('#gap-critical-km').fill('38');
    await saved(page);
    await page.reload();
    await prepared(page);
    await status(page, '#poi-status', 'Lokaler Planungsstand geladen');
    assert.equal(await page.locator('#poi-list .selected.pinned').getAttribute('data-poi-id'), passId);
    await page.locator('#routebook-tab').click();
    assert.equal(await page.locator('#gap-critical-km').inputValue(), '38');

    await page.locator('#export-tab').click();
    for (const format of ['gpx', 'tcx', 'trackkin']) {
      if (format === 'trackkin') await page.locator('#export-target').selectOption('trackkin');
      else await page.locator('#export-format').selectOption(format);
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-download').click()]);
      assert.ok(download.suggestedFilename().endsWith(format === 'trackkin' ? '.json' : `.${format}`));
    }
    await saved(page);
    const [projectDownload] = await Promise.all([
      page.waitForEvent('download'), page.locator('[data-project=export]').click(),
    ]);
    const json = await readFile(await projectDownload.path());
    await page.locator('[data-project=file]').setInputFiles({
      name: 'roundtrip.bonkproof.json', mimeType: 'application/json', buffer: json,
    });
    await status(page, '[data-project=feedback]', 'importiert');
    assert.equal((await page.locator('[data-project=name]').inputValue()).endsWith('(Import)'), true);
    assert.equal(server.state.apiCalls, calls);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);

    if (includeUpdate) await checkUpdate(context, page, server);
    assert.deepEqual(errors, []);
    console.log(`${width}px: offline reload, project edits, persisted pass and pin, warnings, import/export, missing tiles${process.env.BROWSER_ENGINE === 'webkit' ? '' : ', provider failure'}${includeUpdate ? ', controlled update' : ''}`);
  } finally {
    server.state.release = 1;
    server.state.providerMode = 'good';
    server.state.damagedPath = '';
    server.state.mixedBytes = false;
    server.state.simulatedOffline = false;
    await context.close();
  }
}

async function checkUpdate(context, page, server) {
  await setOffline(context, server, false);
  const versionCandidate = () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
    if (!registration.installing) return registration.waiting?.state;
    return new Promise((resolve) => {
      const installing = registration.installing;
      installing.addEventListener('statechange', () => {
        if (['installed', 'redundant'].includes(installing.state)) resolve(installing.state);
      });
    });
  });
  const unrelated = `bonkproof-shell:${new URL('other/', server.url).href}:untouched`;
  await page.evaluate((name) => caches.open(name).then(() => null), unrelated);
  server.state.release = 2;
  server.state.mixedBytes = true;
  server.state.damagedPath = 'config/resupply-profile.json';
  assert.equal(await versionCandidate(), 'redundant');
  assert.equal(await release(page), '1');
  await checkCache(page, server, 1);
  assert.ok((await page.evaluate(() => caches.keys())).every((key) => !key.endsWith(':test-2')));
  server.state.damagedPath = '';
  server.state.mixedBytes = false;
  await versionCandidate();
  await page.locator('#pwa-update').waitFor();

  // Failed project saves keep a genuinely dirty draft while the update is waiting.
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (window.failWrite && this.name === 'metadata') throw new DOMException('quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
    window.failWrite = true;
  });
  await page.locator('[data-project=name]').fill('Offener Entwurf');
  await page.locator('#pwa-update').click();
  await status(page, '#pwa-action-status', 'Speichere die Planung');
  assert.equal(await release(page), '1');
  await page.evaluate(() => { window.failWrite = false; });
  await page.locator('[data-project=save]').click();
  await saved(page);

  const second = await context.newPage();
  await second.goto(server.url);
  await prepared(second);
  await page.locator('#pwa-update').click();
  await status(page, '#pwa-action-status', 'anderen geöffneten Bonkproof-Fenster');
  assert.equal(await release(page), '1');
  await second.close();
  const [navigation] = await Promise.all([
    page.waitForNavigation(), page.locator('#pwa-update').click(),
  ]);
  assert.ok(navigation?.ok());
  await prepared(page);
  await status(page, '#poi-status', 'Lokaler Planungsstand geladen');
  assert.equal(await release(page), '2');
  assert.equal(await page.locator('[data-project=name]').inputValue(), 'Offener Entwurf');
  assert.equal(await page.locator('#poi-list .selected.pinned').count(), 1);
  await checkCache(page, server, 2);
  const cacheNames = await page.evaluate(() => caches.keys());
  assert.ok(cacheNames.every((key) => !key.endsWith(':test-1')));
  assert.ok(cacheNames.includes(unrelated));
  await setOffline(context, server, true);
  const visits = server.state.scopeVisits;
  await page.reload();
  await prepared(page);
  await status(page, '#poi-status', 'Lokaler Planungsstand geladen');
  assert.equal(await release(page), '2');
  assert.equal(await page.locator('#poi-list .selected.pinned').count(), 1);
  assert.equal(server.state.scopeVisits, visits);
}

async function checkLargeProjects(browser, server) {
  const { buildRouteGeometry } = await import('../poi-projection.js');
  const { createProject } = await import('../project-format.js');
  const context = await createContext(browser, 360);
  try {
    const page = await context.newPage();
    await page.goto(server.url);
    await prepared(page);
    const projects = [];
    for (const km of [200, 600, 1000]) {
      const count = km * 100;
      const degreesPerPoint = 10 / 6371008.8 * 180 / Math.PI;
      const points = Array.from({ length: count + 1 }, (_, index) => ({ lat: 46 + index * degreesPerPoint, lon: 9 }));
      const parsed = { segments: [points], distanceMeters: km * 1000 };
      const gpx = '<gpx><trk><name>Synthetische Langstrecke</name><trkseg>'
        + points.map(({ lat, lon }) => `<trkpt lat="${lat}" lon="${lon}"/>`).join('')
        + '</trkseg></trk></gpx>';
      const poses = buildRouteGeometry(parsed).filter(({ geometryIndex }) => geometryIndex % 10 === 0);
      const pois = poses.map(({ a, geometryIndex, routeStartM }) => ({
        osmType: 'node', osmId: geometryIndex + 1, passId: `edge-${geometryIndex}`, passIndex: 1, passCount: 1,
        lat: a.lat, lon: a.lon, tags: { shop: 'supermarket' }, name: `Synthetischer Markt ${geometryIndex + 1}`,
        category: { id: 'supermarket', label: 'Supermarket', group: 'food', defaultRadiusM: 250 },
        routeKm: routeStartM / 1000, offRouteM: 0, status: 'match', scoped: false, scopeKey: null,
      }));
      const selected = pois.filter((_, index) => index % 150 === 0).map(({ osmId, passId }) => `node/${osmId}#${passId}`);
      const project = createProject(`Benchmark ${km} km`, {
        projectionVersion: 1, route: { gpx, fileName: 'synthetisch.gpx' },
        global: { enabled: ['supermarket'], radii: [['supermarket', 250]], loadedRadii: [['supermarket', 250]], coverage: 'complete' },
        scopes: [], pois, accepted: [], selected, pins: selected.slice(0, 8),
        gaps: { criticalDistanceKm: 30, infoPercent: 66, warningPercent: 80, criticalPercent: 95 },
        resupply: ['supermarket'], exportOptions: { target: 'generic', format: 'gpx', gaps: false },
      });
      await page.evaluate(async (snapshot) => {
        const { createProjectStore } = await import('/bonkproof/project-store.js');
        await createProjectStore().save(snapshot);
      }, project);
      projects.push({ id: project.id, km, gpx: project.state.route.gpx, count: pois.length });
    }
    const calls = server.state.apiCalls;
    await setOffline(context, server, true);
    await page.reload();
    await prepared(page);
    for (const { id, km, gpx, count } of projects) {
      await page.locator('[data-project=list]').selectOption(id);
      await page.locator('[data-project=open]').click();
      await page.waitForFunction((name) => document.querySelector('[data-project=name]').value === name, `Benchmark ${km} km`);
      await status(page, '#poi-status', 'Lokaler Planungsstand geladen');
      await page.locator('#routebook-tab').click();
      await page.locator('#gap-critical-km').fill('38');
      await saved(page);
      const [file] = await Promise.all([
        page.waitForEvent('download'), page.locator('[data-project=export]').click(),
      ]);
      assert.ok(file.suggestedFilename().endsWith('.bonkproof.json'));
      const exported = JSON.parse(await readFile(await file.path(), 'utf8'));
      assert.equal(exported.id, id);
      assert.equal(exported.state.route.gpx, gpx);
      assert.equal(exported.state.pois.length, count);
      assert.equal(exported.state.gaps.criticalDistanceKm, 38);
      console.log(`${km} km / ${count} POIs: offline open, edit, save and project export`);
    }
    assert.equal(server.state.apiCalls, calls);
  } finally {
    server.state.simulatedOffline = false;
    await context.close();
  }
}

async function run() {
  const server = await startServer();
  let browser;
  try {
    const engine = process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium;
    const executablePath = process.env.CHROMIUM_EXECUTABLE;
    browser = await engine.launch(engine === chromium && executablePath ? { executablePath } : {});
    await failedInstall(browser, server);
    await checkPlanning(browser, server, 360, true);
    await checkPlanning(browser, server, 1440, false);
    if (process.env.LARGE_PROJECTS === '1') await checkLargeProjects(browser, server);
  } finally {
    await browser?.close();
    await server.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
