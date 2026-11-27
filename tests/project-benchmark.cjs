// Optional synthetic benchmark using Chromium and real IndexedDB. All network requests are intercepted.
const { chromium } = require('playwright');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const origin = 'http://localhost:3211';
const media = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' };

async function sample(browser, kilometres) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 850 } });
  await context.route('**/*', async (request) => {
    const url = new URL(request.request().url());
    if (url.origin !== origin || url.pathname.startsWith('/api/')) return request.abort();
    const file = url.pathname === '/' ? '/index.html' : url.pathname;
    try {
      await request.fulfill({ body: await readFile(root + file), contentType: media[path.extname(file)] });
    } catch {
      await request.fulfill({ status: 404 });
    }
  });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const heap = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      return (await cdp.send('Runtime.getHeapUsage')).usedSize;
    };
    await page.goto(origin);
    await page.locator('[data-category-toggle=supermarket]').waitFor();
    const before = await heap();
    const result = await page.evaluate(async (km) => {
      const { buildRouteGeometry } = await import('/poi-projection.js');
      const { buildPoiQuerySections } = await import('/poi-search.js');
      const { createProject, validateProject } = await import('/project-format.js');
      const { createProjectStore } = await import('/project-store.js');
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
      let start = performance.now();
      const json = JSON.stringify(project);
      const serializeMs = performance.now() - start;
      const bytes = new Blob([json]).size;
      start = performance.now();
      const decoded = JSON.parse(json);
      const jsonParseMs = performance.now() - start;
      start = performance.now();
      validateProject(decoded, () => parsed);
      const validateMs = performance.now() - start;
      start = performance.now();
      buildPoiQuerySections(parsed);
      const packagesMs = performance.now() - start;

      const store = createProjectStore();
      await store.list(); // Exclude first connection and schema creation from save timing.
      const delays = [];
      let previous = performance.now();
      const timer = setInterval(() => {
        const now = performance.now();
        delays.push(now - previous);
        previous = now;
      }, 10);
      start = performance.now();
      await store.save(project);
      const saveMs = performance.now() - start;
      await new Promise((resolve) => setTimeout(resolve, 25));
      clearInterval(timer);
      start = performance.now();
      await store.get(project.id);
      const readMs = performance.now() - start;
      return {
        kilometres: km, routePoints: points.length, pois: pois.length, id: project.id, bytes,
        serializeMs, jsonParseMs, validateMs, packagesMs, saveMs, readMs,
        largestWriteTimerIntervalMs: Math.max(...delays),
      };
    }, kilometres);

    await page.reload();
    await page.locator('[data-project=list] option[value="' + result.id + '"]').waitFor({ state: 'attached' });
    await page.locator('[data-project=list]').selectOption(result.id);
    await page.evaluate(() => {
      window.benchmarkOpenStarted = performance.now();
      document.querySelector('[data-project=open]').click();
    });
    await page.waitForFunction(() => document.querySelector('#poi-status').textContent.includes('Lokaler Planungsstand'));
    result.openMs = await page.evaluate(() => performance.now() - window.benchmarkOpenStarted);
    result.retainedJsHeapBytes = (await heap()) - before;
    const interfaceSave = await page.evaluate(async () => {
      const summary = document.querySelector('[data-project=summary]');
      const name = document.querySelector('[data-project=name]');
      name.value += ' (Test)';
      name.dispatchEvent(new Event('input', { bubbles: true }));
      const start = performance.now();
      let lastTick = start;
      let longest = 0;
      const interval = setInterval(() => {
        const now = performance.now();
        longest = Math.max(longest, now - lastTick);
        lastTick = now;
      }, 10);
      const ms = await new Promise((resolve, reject) => {
        const observer = new MutationObserver(() => {
          if (summary.textContent === 'Gespeichert') {
            observer.disconnect();
            resolve(performance.now() - start);
          } else if (summary.textContent === 'Speicherung fehlgeschlagen') {
            observer.disconnect();
            reject(new Error(document.querySelector('[data-project=status]').textContent));
          }
        });
        observer.observe(summary, { childList: true, characterData: true, subtree: true });
        document.querySelector('[data-project=save]').click();
      }).finally(() => clearInterval(interval));
      return { interfaceSaveMs: ms, interfaceLargestTimerIntervalMs: Math.max(longest, performance.now() - lastTick) };
    });
    Object.assign(result, interfaceSave);
    delete result.id;
    console.log(JSON.stringify(result));
  } finally {
    await context.close();
  }
}

async function run() {
  const executablePath = process.env.CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const repeats = Number(process.env.BENCHMARK_REPEATS ?? 1);
    for (const km of [200, 600, 1000]) {
      for (let repeat = 0; repeat < repeats; repeat += 1) await sample(browser, km);
    }
  } finally {
    await browser.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
