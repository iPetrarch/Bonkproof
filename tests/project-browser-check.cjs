const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const base = 'http://localhost:3210/';
const lons = Array.from({length:41},(_,i)=>9+i*.04);
const gpx = (lat=52) => '<gpx><trk><name>Hin und zurück</name><trkseg>'+[...lons,...lons.slice(0,-1).reverse()].map(lon=>'<trkpt lat="'+lat+'" lon="'+lon+'"/>').join('')+'</trkseg></trk></gpx>';
const file = (name,body) => ({name,mimeType:'application/json',buffer:Buffer.from(body)});
const anchorId = `anchor"'&`;
const delays = new WeakMap();
let providerCalls = 0;
async function install(context) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'overpass-api.de') { providerCalls++; return route.fulfill({json:{elements:[]}}); }
    if (url.origin !== new URL(base).origin) return route.abort();
    if (url.pathname === '/api/places.php') {
      providerCalls++;
      const p=url.searchParams;
      const delay=delays.get(route.request().frame().page()) || 0;
      if(delay) await new Promise(r=>setTimeout(r,delay));
      const places=[
        {id:anchorId,name:'<Wendeladen>', category:'supermarket',lat:52,lon:10.44},
        {id:'market',name:'Nachsuche-Markt',category:'supermarket',lat:52.0035,lon:9.8},
      ].filter(x=>p.get('categories').split(',').includes(x.category)&&+p.get('west')<=x.lon&&+p.get('east')>=x.lon&&+p.get('south')<=x.lat&&+p.get('north')>=x.lat);
      return route.fulfill({json:{places}}).catch(()=>{});
    }
    const p=url.pathname==='/' ? '/index.html' : url.pathname;
    try {return await route.fulfill({body:await fs.readFile(root+p),contentType:{js:'text/javascript',css:'text/css',html:'text/html',json:'application/json',png:'image/png'}[p.split('.').at(-1)]});}
    catch {return route.fulfill({status:404});}
  });
}
const control=(page,key)=>page.locator('[data-project="'+key+'"]');
const waitSaved=p=>p.waitForFunction(()=>document.querySelector('[data-project=summary]').textContent==='Gespeichert');
const waitStatus=(p,text)=>p.waitForFunction(s=>document.querySelector('[data-project=summary]').textContent.includes(s),text);
const waitLoaded=p=>p.waitForFunction(()=>document.querySelector('#poi-status').textContent.includes('Lokaler Planungsstand'));
const routeReady=p=>p.waitForFunction(()=>!document.querySelector('#reload-pois').disabled && document.querySelector('#poi-status').textContent.includes('vollständig geladen'));
const confirm=(p,accept)=>p.once('dialog',d=>accept?d.accept():d.dismiss());
async function start(p) { await p.goto(base); await p.locator('[data-category-toggle=supermarket]').waitFor(); }
async function select(p,id){await control(p,'list').selectOption(id);}
async function jsonExport(p,key='export'){
  const [download]=await Promise.all([p.waitForEvent('download'),control(p,key).click()]);
  return JSON.parse(await fs.readFile(await download.path(),'utf8'));
}
(async()=>{
 const executablePath = process.env.CHROMIUM_EXECUTABLE;
 const browser = await chromium.launch(executablePath ? { executablePath } : {});
 try {
 for(const width of [360,1440]) {
  const context=await browser.newContext({viewport:{width,height:850},acceptDownloads:true});
  await install(context);
  const page=await context.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await start(page);
  await page.locator('#gpx-file').setInputFiles(file('route.gpx',gpx()));
  await routeReady(page);
  const original=page.locator('.poi-list-item').first();
  const pass=await original.getAttribute('data-poi-id');
  await original.locator('.poi-selection').click();
  await original.locator('.poi-pin').click();
  await page.locator('.scoped-poi-open').first().click();
  await page.locator('#scoped-poi-categories [value=supermarket]').check();
  await page.locator('#scoped-poi-categories input[type=number]').first().fill('800');
  await page.locator('#scoped-poi-submit').click();
  const scoped=page.locator('#scoped-poi-results label').filter({hasText:'Nachsuche-Markt'}).locator('input');
  await scoped.check();
  await page.locator('#scoped-poi-review button').click();
  const warning=await page.locator('#poi-warning-summary').innerText();
  await control(page,'name').fill('Tour A');
  await control(page,'save').click();
  await waitSaved(page);
  const exported=await jsonExport(page);
  assert.equal(exported.state.pois.filter(p=>p.osmId===anchorId).length,2);
  assert.deepEqual(exported.state.selected,[pass]);
  assert.deepEqual(exported.state.pins,[pass]);
  assert.equal(exported.state.accepted.length,1);
  assert.equal(exported.state.scopes.length,1);
  const firstId=exported.id;
  const calls=providerCalls;
  await page.reload();
  await waitLoaded(page);
  await waitSaved(page);
  assert.equal(providerCalls,calls);
  assert.equal(await page.locator('#poi-warning-summary').innerText(),warning);
  assert.equal(await page.locator('.poi-list-item.selected.pinned').getAttribute('data-poi-id'),pass);
  assert.deepEqual((await jsonExport(page)).state,exported.state);
  confirm(page, false);
  await page.locator('#map').press('Escape');
  assert.equal(await page.locator('#route-card').isVisible(), true);
  await page.locator('.poi-list-item.selected.pinned .poi-list-button').click();
  await page.locator('.leaflet-popup-content button[data-poi-id]').waitFor();
  assert.match(await page.locator('.leaflet-popup-content strong').innerText(), /<Wendeladen>/);
  const savedRevision = () => page.evaluate(async (id) => {
    const { createProjectStore } = await import('/project-store.js');
    return (await createProjectStore().list()).find((entry) => entry.id === id).revision;
  }, firstId);
  const revisionBeforeViewChanges = await savedRevision();
  await page.locator('.leaflet-control-zoom-out').click();
  const categoriesSummary = page.locator('details:has(#poi-categories) > summary');
  await categoriesSummary.click();
  await categoriesSummary.click();
  await page.waitForTimeout(1350);
  assert.equal(await savedRevision(), revisionBeforeViewChanges);
  await page.locator('#export-tab').click();
  for(const format of ['gpx','tcx','trackkin']) {
    if(format==='trackkin') await page.locator('#export-target').selectOption('trackkin');
    else await page.locator('#export-format').selectOption(format);
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-download').click()]);
    assert.ok(download.suggestedFilename().endsWith(format==='trackkin'?'.json':'.'+format));
  }
  await page.locator('#pois-tab').click();
  await control(page,'name').fill('Tour A1');
  await control(page,'name').fill('Tour A2');
  await control(page,'name').fill('Tour nach Autosave');
  await waitStatus(page,'Ungespeichert');
  await waitSaved(page);

  // Keep a conflicting tab on the same revision, then save from the first tab.
  const second=await context.newPage(); await start(second);
  await select(second,firstId); await control(second,'open').click(); await waitLoaded(second);
  await control(page,'name').fill('Tour vom ersten Tab');
  await waitSaved(page);
  await control(second,'name').fill('Entwurf zweiter Tab');
  await control(second,'save').click();
  await waitStatus(second,'fehlgeschlagen');
  assert.match(await control(second,'status').innerText(),/anderen Tab/);
  await control(second,'duplicate').click();
  await waitSaved(second);
  const copied=await jsonExport(second);
  assert.notEqual(copied.id,firstId);
  assert.match(copied.name,/Entwurf zweiter Tab/);
  assert.equal(copied.state.accepted.length,1);
  await second.close();

  // Simulate quota failure for a real IndexedDB transaction and recover on retry.
  await page.evaluate(()=>{
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args){
      if(window.forceQuota && this.name==='metadata') throw new DOMException('full','QuotaExceededError');
      return put.apply(this,args);
    };
    window.forceQuota=true;
  });
  await control(page,'name').fill('Planung nach Speicherfehler');
  await control(page,'save').click(); await waitStatus(page,'fehlgeschlagen');
  assert.match(await control(page,'status').innerText(),/voll/);
  assert.equal((await jsonExport(page)).name,'Planung nach Speicherfehler');
  const storedName = await page.evaluate((id) => new Promise((resolve, reject) => {
    const open = indexedDB.open('bonkproof-projects');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction('projects').objectStore('projects').get(id);
      read.onerror = () => { db.close(); reject(read.error); };
      read.onsuccess = () => { db.close(); resolve(read.result.project.name); };
    };
  }), firstId);
  assert.equal(storedName, 'Tour vom ersten Tab');
  await page.evaluate(()=>{window.forceQuota=false;});
  await control(page,'save').click(); await waitSaved(page);

  // Abort after a write request succeeds, before the transaction itself commits.
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (this.name === 'metadata' && window.abortNextProjectCommit) {
        const transaction = this.transaction;
        request.addEventListener('success', () => {
          window.abortNextProjectCommit = false;
          transaction.abort();
        }, { once: true });
      }
      return request;
    };
    window.abortNextProjectCommit = true;
  });
  await control(page, 'name').fill('Abgebrochener Schreibvorgang');
  await control(page, 'save').click();
  await waitStatus(page, 'fehlgeschlagen');
  assert.equal((await jsonExport(page)).name, 'Abgebrochener Schreibvorgang');
  confirm(page, true);
  await page.reload();
  await waitLoaded(page);
  assert.equal(await control(page, 'name').inputValue(), 'Planung nach Speicherfehler');

  // Validate import before writing, then import the same ID as a copy.
  await control(page, 'file').setInputFiles({ name: 'bad-utf8.json', mimeType: 'application/json', buffer: Buffer.from([0xff]) });
  await page.waitForFunction(() => document.querySelector('[data-project=feedback]').textContent.includes('UTF-8-JSON'));
  await control(page,'file').setInputFiles(file('incompatible.json',JSON.stringify({...exported,schemaVersion:900})));
  await page.waitForFunction(()=>document.querySelector('[data-project=feedback]').textContent.includes('nicht unterstützt'));
  await control(page,'file').setInputFiles(file('same.json',JSON.stringify(exported)));
  await page.waitForFunction(()=>document.querySelector('[data-project=feedback]').textContent.includes('importiert'));
  const imported=await jsonExport(page);
  assert.notEqual(imported.id,firstId);
  assert.deepEqual(imported.state,exported.state);

  await control(page,'name').fill('Ungespeichert');
  await select(page,firstId); confirm(page,false); await control(page,'open').click();
  await page.waitForFunction(()=>!document.querySelector('[data-project=open]').disabled);
  assert.equal(await control(page,'name').inputValue(),'Ungespeichert');
  await waitSaved(page);

  // Switching while a query is running cancels it and retains the destination.
  delays.set(page,700);
  await page.locator('#reload-pois').click();
  await page.waitForFunction(()=>document.querySelector('#reload-pois').disabled);
  await select(page,firstId); await control(page,'open').click();
  await waitLoaded(page); await page.waitForTimeout(850);
  assert.equal(await control(page,'name').inputValue(),'Planung nach Speicherfehler');
  assert.equal((await jsonExport(page)).id,firstId);

  // A scoped response from the old project cannot populate the destination.
  await page.locator('.scoped-poi-open').first().click();
  await page.locator('#scoped-poi-categories [value=fuel]').check();
  await page.locator('#scoped-poi-submit').click();
  await select(page, imported.id);
  confirm(page, true);
  await control(page, 'open').click();
  await page.waitForFunction(() => document.querySelector('#scoped-poi-search').hidden);
  await page.waitForTimeout(850);
  assert.equal((await jsonExport(page)).id, imported.id);
  assert.equal(await page.locator('#scoped-poi-results li').count(), 0);

  // Deleting a project with a pending autosave keeps that newer edit as a draft.
  await control(page, 'name').fill('Entwurf aus gelöschtem Projekt');
  await select(page,imported.id);
  confirm(page,true); await control(page,'delete').click();
  await page.waitForFunction(()=>document.querySelector('[data-project=feedback]').textContent.includes('gelöscht'));
  assert.equal(await control(page,'list').locator('option[value="'+imported.id+'"]').count(),0);
  assert.equal((await jsonExport(page)).name, 'Entwurf aus gelöschtem Projekt');
  const corruption = await page.evaluate(async (id) => {
    const { createProjectStore } = await import('/project-store.js');
    const store = createProjectStore();
    const { project } = await store.get(id);
    const open = indexedDB.open('bonkproof-projects');
    const db = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const remove = db.transaction('metadata', 'readwrite');
    const removed = new Promise((resolve, reject) => {
      remove.oncomplete = resolve;
      remove.onabort = () => reject(remove.error);
    });
    remove.objectStore('metadata').delete(id);
    await removed;
    const readError = await store.get(id).then(() => null, (error) => error.message);
    const writeError = await store.save({ ...project, name: 'Unerlaubtes Überschreiben' })
      .then(() => null, (error) => error.name);
    const read = db.transaction('projects').objectStore('projects').get(id);
    const preservedName = await new Promise((resolve, reject) => {
      read.onsuccess = () => resolve(read.result.project.name);
      read.onerror = () => reject(read.error);
    });
    db.close();
    return { readError, writeError, preservedName };
  }, firstId);
  assert.match(corruption.readError, /widersprüchliche Speicherdaten/);
  assert.equal(corruption.writeError, 'ProjectConflictError');
  assert.equal(corruption.preservedName, 'Planung nach Speicherfehler');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  assert.deepEqual(errors,[]);
  console.log(width+'px: Roundtrip, reload without lookup, scope, pins, selection, warnings, exports, autosave, quota rollback, tab conflict, import, cancel open, switch during search, delete.');
  await context.close();
 }
 const blocked = await browser.newContext();
 await install(blocked);
 await blocked.addInitScript(() => {
   Object.defineProperty(window, 'indexedDB', {
     get() { throw new DOMException('blocked', 'SecurityError'); },
   });
 });
 const restrictedPage = await blocked.newPage();
 await start(restrictedPage);
 await control(restrictedPage,'name').fill('Planung ohne Speicherzugriff');
 await control(restrictedPage,'save').click();
 await waitStatus(restrictedPage,'fehlgeschlagen');
 assert.equal((await jsonExport(restrictedPage)).name,'Planung ohne Speicherzugriff');
 console.log('Restricted IndexedDB: save failure is visible and export remains available.');
 await blocked.close();
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
