import { DEFAULT_GAP_SETTINGS, buildFoundPoiWarnings, buildGapThresholds, buildRoutebook, buildRoutebookWarnings, extractRouteGeometryRange, normalizeGapSettings, poiKey, togglePoiSelection } from './routebook.js';
import { buildPoiQuerySections, createPoiQueryWorkloads, fetchPoiSectionWithRetry, paginatePois, POI_LIST_PAGE_SIZE, splitPoiQueryWorkload } from './poi-search.js';
import { clusterAccessibleLabel, clusterPoiData, clusterRingStyle, POI_CLUSTER_DISABLE_ZOOM, POI_CLUSTER_RADIUS_PX, POI_CLUSTER_SPIDERFY_ZOOM } from './poi-clustering.js';
import { buildRouteGeometry, physicalPoiKey, projectPoiPassBys } from './poi-projection.js';
import { buildActiveCategories, buildOverpassQuery, defaultCategoryRadii, defaultEnabledCategoryIds, getGraceMeters, matchingCategory } from './poi-config.js';
import { filterReliableResupplyPois, filterReliableSelectedPoiIds } from './resupply-profile.js';

(() => {
  const CONFIG_URL = './config/poi-categories.json';
  const RESUPPLY_PROFILE_URL = './config/resupply-profile.json';
  const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
  const INITIAL_CATEGORY_IDS = ['supermarket', 'fuel', 'drinking_water'];

  const fileInput = document.getElementById('gpx-file');
  const dropZone = document.getElementById('drop-zone');
  const routeCard = document.getElementById('route-card');
  const routeName = document.getElementById('route-name');
  const routeFile = document.getElementById('route-file');
  const routeDistance = document.getElementById('route-distance');
  const routePoints = document.getElementById('route-points');
  const replaceRoute = document.getElementById('replace-route');
  const errorMessage = document.getElementById('error-message');
  const poiStatus = document.getElementById('poi-status');
  const poiCategories = document.getElementById('poi-categories');
  const poiLegend = document.getElementById('poi-legend');
  const poiList = document.getElementById('poi-list');
  const poiTotal = document.getElementById('poi-total');
  const poiEmpty = document.getElementById('poi-empty');
  const poiPagination = document.getElementById('poi-pagination');
  const poiPageSummary = document.getElementById('poi-page-summary');
  const poiPageNumber = document.getElementById('poi-page-number');
  const poiPrevious = document.getElementById('poi-previous');
  const poiNext = document.getElementById('poi-next');
  const poisTab = document.getElementById('pois-tab');
  const routebookTab = document.getElementById('routebook-tab');
  const poiPanel = document.getElementById('poi-panel');
  const routebookPanel = document.getElementById('routebook-panel');
  const routebookSummary = document.getElementById('routebook-summary');
  const routebookEmpty = document.getElementById('routebook-empty');
  const routebookList = document.getElementById('routebook-list');
  const poiWarningSummary = document.getElementById('poi-warning-summary');
  const poiWarningList = document.getElementById('poi-warning-list');
  const reloadPois = document.getElementById('reload-pois');
  const gapCriticalKm = document.getElementById('gap-critical-km');
  const gapInfoPercent = document.getElementById('gap-info-percent');
  const gapWarningPercent = document.getElementById('gap-warning-percent');
  const gapCriticalPercent = document.getElementById('gap-critical-percent');
  const gapThresholdPreview = document.getElementById('gap-threshold-preview');
  const gapSettingsError = document.getElementById('gap-settings-error');
  const gapSettingInputs = [gapCriticalKm, gapInfoPercent, gapWarningPercent, gapCriticalPercent];

  const map = L.map('map', {
    zoomControl: true,
    preferCanvas: true,
  }).setView([52.5, 9.0], 6);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const routeLayer = L.featureGroup().addTo(map);
  const poiLayer = L.featureGroup().addTo(map);
  const warningLayer = L.featureGroup().addTo(map);

  let errorTimer = null;
  let poiConfigPromise = null;
  let resupplyProfilePromise = null;
  let poiConfig = null;
  let resupplyProfile = null;
  let categoryRadiusOverrides = new Map();
  let poiAbortController = null;
  let currentPois = [];
  let currentCategories = [];
  let selectedPoiIds = new Set();
  let pinnedPoiIds = new Set();
  let pinnedPoiSnapshots = new Map();
  let currentRouteDistanceMeters = 0;
  let currentParsedRoute = null;
  let poiSearchRunning = false;
  let currentPoiSections = [];
  let failedPoiSections = [];
  let poiSectionStatus = { total: 0, completed: 0, failed: new Set(), started: false };
  let poiPage = 1;
  let activeCategoryIds = new Set(INITIAL_CATEGORY_IDS);
  let activeTab = 'pois';
  let gapSettings = { ...DEFAULT_GAP_SETTINGS };
  const poiMarkers = new Map();

  function showError(message) {
    clearTimeout(errorTimer);
    errorMessage.textContent = message;
    errorMessage.hidden = false;
    errorTimer = setTimeout(() => {
      errorMessage.hidden = true;
    }, 6000);
  }

  function setPoiStatus(message) {
    poiStatus.textContent = message;
  }

  function waitForPoiBackoff(milliseconds, section, signal, rateLimited = false) {
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const label = rateLimited ? 'Overpass begrenzt derzeit die Anfragen.' : 'Neuer Versuch wird vorbereitet.';
    setPoiStatus(`${label} Neuer Versuch in ${totalSeconds} Sekunden.`);
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, Math.ceil((milliseconds - elapsed) / 1000));
        if (signal?.aborted || remaining <= 0) {
          clearInterval(timer);
          resolve();
        } else {
          setPoiStatus(`${label} Neuer Versuch in ${remaining} Sekunden.`);
        }
      }, 1000);
    });
  }

  function clearPoiUi() {
    poiLayer.clearLayers();
    poiMarkers.clear();
    currentPois = [];
    currentCategories = [];
    poiPage = 1;
    poiCategories.hidden = true;
    poiLegend.hidden = true;
    poiList.hidden = true;
    poiList.innerHTML = '';
    poiEmpty.hidden = true;
    poiEmpty.textContent = '';
    poiPagination.hidden = true;
    poiTotal.hidden = true;
    poiTotal.textContent = '0';
    poiCategories.querySelectorAll('[data-category-count]').forEach((node) => {
      node.textContent = '0';
    });
  }

  function setPoiSearchRunning(running) {
    poiSearchRunning = running;
    reloadPois.disabled = running || !currentParsedRoute;
    const incomplete = poiSectionStatus.started && (poiSectionStatus.failed.size > 0 || poiSectionStatus.completed < poiSectionStatus.total);
    reloadPois.textContent = running
      ? 'POIs werden gesucht…'
      : (incomplete ? 'Fehlgeschlagene Suchpakete erneut laden' : 'POIs neu laden');
    if (typeof poiWarningSummary !== 'undefined') renderWarnings();
  }

  function resetRoutebook() {
    selectedPoiIds = new Set();
    currentRouteDistanceMeters = 0;
    renderRoutebook();
    renderWarnings();
  }

  function resetPoiViewState() {
    poiPage = 1;
    activeCategoryIds = poiConfig ? defaultEnabledCategoryIds(poiConfig) : new Set(INITIAL_CATEGORY_IDS);
    categoryRadiusOverrides = poiConfig ? defaultCategoryRadii(poiConfig) : new Map();
    if (poiConfig) renderCategoryControls(poiConfig);
  }

  function clearRoute() {
    poiAbortController?.abort();
    routeLayer.clearLayers();
    currentParsedRoute = null;
    currentPoiSections = [];
    failedPoiSections = [];
    poiSectionStatus = { total: 0, completed: 0, failed: new Set(), started: false };
    resetPoiViewState();
    clearPoiUi();
    resetRoutebook();
    routeCard.hidden = true;
    dropZone.hidden = false;
    fileInput.value = '';
    setPoiSearchRunning(false);
    poiCategories.hidden = !poiConfig;
    setPoiStatus('Load a GPX route. Bonkproof will then look for the enabled POI categories near the route.');
  }

  function toRad(value) {
    return value * Math.PI / 180;
  }

  function haversineMeters(a, b) {
    const earthRadius = 6371008.8;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
    return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function segmentDistanceMeters(points) {
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      total += haversineMeters(points[i - 1], points[i]);
    }
    return total;
  }

  function parsePoint(node) {
    const lat = Number.parseFloat(node.getAttribute('lat'));
    const lon = Number.parseFloat(node.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }
    return { lat, lon };
  }

  function parseGpx(xmlText) {
    const parser = new DOMParser();
    const documentXml = parser.parseFromString(xmlText, 'application/xml');

    if (documentXml.querySelector('parsererror')) {
      throw new Error('The selected file is not valid XML/GPX.');
    }

    const root = documentXml.documentElement;
    if (!root || root.localName.toLowerCase() !== 'gpx') {
      throw new Error('The selected file does not appear to be a GPX document.');
    }

    const trackSegments = Array.from(documentXml.getElementsByTagNameNS('*', 'trkseg'))
      .map((segment) => Array.from(segment.getElementsByTagNameNS('*', 'trkpt')).map(parsePoint).filter(Boolean))
      .filter((points) => points.length > 0);

    let segments = trackSegments;
    if (segments.length === 0) {
      const routePointsRaw = Array.from(documentXml.getElementsByTagNameNS('*', 'rtept')).map(parsePoint).filter(Boolean);
      if (routePointsRaw.length > 0) {
        segments = [routePointsRaw];
      }
    }

    if (segments.length === 0) {
      throw new Error('No track or route points were found in this GPX file.');
    }

    const metadataName = documentXml.getElementsByTagNameNS('*', 'metadata')[0]
      ?.getElementsByTagNameNS('*', 'name')[0]?.textContent?.trim();
    const trackName = documentXml.getElementsByTagNameNS('*', 'trk')[0]
      ?.getElementsByTagNameNS('*', 'name')[0]?.textContent?.trim();
    const rteName = documentXml.getElementsByTagNameNS('*', 'rte')[0]
      ?.getElementsByTagNameNS('*', 'name')[0]?.textContent?.trim();

    const pointCount = segments.reduce((sum, segment) => sum + segment.length, 0);
    const distanceMeters = segments.reduce((sum, segment) => sum + segmentDistanceMeters(segment), 0);

    return {
      name: metadataName || trackName || rteName || null,
      segments,
      pointCount,
      distanceMeters,
    };
  }

  function formatDistance(meters) {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    const km = meters / 1000;
    return `${km < 10 ? km.toFixed(2) : km.toFixed(1)} km`;
  }

  function formatRouteKm(meters) {
    return `km ${(meters / 1000).toFixed(1)}`;
  }

  function formatThresholdKm(meters) {
    const km = meters / 1000;
    return `${Number.isInteger(km) ? km.toFixed(0) : km.toFixed(1)} km`;
  }

  function renderGapSettingsPreview() {
    const thresholds = buildGapThresholds(gapSettings);
    gapThresholdPreview.textContent = `Info > ${formatThresholdKm(thresholds.infoM)} · Warning > ${formatThresholdKm(thresholds.warningM)} · Critical > ${formatThresholdKm(thresholds.criticalM)}`;
  }

  function applyGapSettingsFromInputs() {
    try {
      const next = normalizeGapSettings({
        criticalDistanceKm: gapCriticalKm.value,
        infoPercent: gapInfoPercent.value,
        warningPercent: gapWarningPercent.value,
        criticalPercent: gapCriticalPercent.value,
      });
      gapSettings = next;
      gapSettingsError.hidden = true;
      gapSettingsError.textContent = '';
      gapSettingInputs.forEach((input) => input.removeAttribute('aria-invalid'));
      renderGapSettingsPreview();
      renderRoutebook();
      renderWarnings();
      renderWarningLayer();
    } catch (error) {
      gapSettingsError.hidden = false;
      gapSettingsError.textContent = error instanceof Error ? error.message : 'Ungültige Schwellenwerte.';
      gapSettingInputs.forEach((input) => input.setAttribute('aria-invalid', 'true'));
    }
  }

  function markerIcon(kind) {
    return L.divIcon({
      className: '',
      html: `<div class="route-marker ${kind === 'finish' ? 'finish' : ''}" aria-hidden="true"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }

  function categorySymbol(category) {
    if (category.id === 'supermarket') return 'S';
    if (category.id === 'fuel') return 'F';
    if (category.id === 'drinking_water') return 'W';
    return category.label.slice(0, 1).toUpperCase();
  }

  function poiMarkerIcon(poi) {
    const label = categorySymbol(poi.category);
    const poiId = poiKey(poi);
    const selectedClass = selectedPoiIds.has(poiId) ? 'selected' : '';
    const pinnedClass = pinnedPoiIds.has(poiId) ? 'pinned' : '';
    return L.divIcon({
      className: '',
      html: `<div class="poi-marker ${poi.status === 'near-miss' ? 'near-miss' : ''} ${poi.status === 'pinned' ? 'pinned-outside' : ''} ${poi.category.id} ${selectedClass} ${pinnedClass}" aria-hidden="true">${escapeHtml(label)}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -14],
    });
  }

  function renderRoute(parsed, fileName) {
    poiAbortController?.abort();
    poiSearchRunning = false;
    routeLayer.clearLayers();
    poiLayer.clearLayers();
    poiMarkers.clear();
    currentPois = [];
    selectedPoiIds = new Set();
    pinnedPoiIds = new Set();
    pinnedPoiSnapshots = new Map();
    currentRouteDistanceMeters = parsed.distanceMeters;
    currentParsedRoute = parsed;
    currentPoiSections = buildPoiQuerySections(parsed);
    failedPoiSections = [];
    poiSectionStatus = { total: currentPoiSections.length, completed: 0, failed: new Set(), started: false };
    resetPoiViewState();

    parsed.segments.forEach((segment) => {
      L.polyline(segment.map((point) => [point.lat, point.lon]), {
        color: '#1f5f73',
        weight: 5,
        opacity: 0.94,
        lineJoin: 'round',
      }).addTo(routeLayer);
    });

    const firstSegment = parsed.segments[0];
    const lastSegment = parsed.segments[parsed.segments.length - 1];
    const start = firstSegment[0];
    const finish = lastSegment[lastSegment.length - 1];

    L.marker([start.lat, start.lon], { icon: markerIcon('start'), title: 'Start' }).bindTooltip('Start').addTo(routeLayer);
    L.marker([finish.lat, finish.lon], { icon: markerIcon('finish'), title: 'Finish' }).bindTooltip('Finish').addTo(routeLayer);

    map.fitBounds(routeLayer.getBounds(), { padding: [34, 34] });
    routeName.textContent = parsed.name || 'Unnamed route';
    routeFile.textContent = fileName;
    routeDistance.textContent = formatDistance(parsed.distanceMeters);
    routePoints.textContent = parsed.pointCount.toLocaleString();
    routeCard.hidden = false;
    dropZone.hidden = true;
    setPoiSearchRunning(false);
    renderRoutebook();
  }

  function renderCategoryControls(config) {
    poiCategories.innerHTML = '';
    config.categories.forEach((category) => {
      const active = activeCategoryIds.has(category.id);
      const radiusM = categoryRadiusOverrides.get(category.id) ?? category.defaultRadiusM;
      const row = document.createElement('div');
      row.className = `category-row ${active ? '' : 'is-inactive'}`;
      row.dataset.category = category.id;
      row.innerHTML = `
        <button type="button" class="category-toggle" aria-pressed="${active}" data-category-toggle="${escapeHtml(category.id)}">
          <span class="category-symbol ${category.id === 'fuel' ? 'fuel' : ''}" aria-hidden="true">${escapeHtml(categorySymbol(category))}</span>
          <span class="category-copy"><strong>${escapeHtml(category.label)}</strong><small>${escapeHtml(category.group || 'other')}</small></span>
          <span class="category-count" data-category-count="${escapeHtml(category.id)}">0</span>
        </button>
        <label class="category-radius"><span>Radius</span><span><input type="number" min="50" max="20000" step="50" value="${radiusM}" data-category-radius="${escapeHtml(category.id)}"> m</span></label>
      `;
      poiCategories.appendChild(row);
    });
    poiCategories.hidden = false;
  }

  async function getPoiConfig() {
    if (!poiConfigPromise) {
      poiConfigPromise = fetch(CONFIG_URL, { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Could not load POI configuration (${response.status}).`);
        }
        return response.json();
      }).then((config) => {
        poiConfig = config;
        activeCategoryIds = defaultEnabledCategoryIds(config);
        categoryRadiusOverrides = defaultCategoryRadii(config);
        renderCategoryControls(config);
        return config;
      });
    }
    return poiConfigPromise;
  }

  async function getResupplyProfile() {
    if (!resupplyProfilePromise) {
      resupplyProfilePromise = fetch(RESUPPLY_PROFILE_URL, { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) throw new Error(`Could not load resupply profile (${response.status}).`);
        return response.json();
      }).then((profile) => {
        resupplyProfile = profile;
        return profile;
      });
    }
    return resupplyProfilePromise;
  }

  function getRouteBounds(parsed, paddingMeters) {
    const all = parsed.segments.flat();
    let south = Infinity;
    let west = Infinity;
    let north = -Infinity;
    let east = -Infinity;

    all.forEach(({ lat, lon }) => {
      south = Math.min(south, lat);
      west = Math.min(west, lon);
      north = Math.max(north, lat);
      east = Math.max(east, lon);
    });

    const meanLat = (south + north) / 2;
    const latPad = paddingMeters / 111320;
    const lonPad = paddingMeters / (111320 * Math.max(0.2, Math.cos(toRad(meanLat))));
    return [south - latPad, west - lonPad, north + latPad, east + lonPad];
  }

  async function fetchOsmCandidates(categories, section, config, signal) {
    const maxEnvelope = Math.max(...categories.map((category) => category.radiusM + getGraceMeters(category, config)));
    const bbox = getRouteBounds({ segments: [section.points] }, maxEnvelope);
    const query = buildOverpassQuery(categories, bbox);
    const body = new URLSearchParams({ data: query });

    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body,
      signal,
    });

    if (!response.ok) {
      const error = new Error(`OpenStreetMap POI lookup failed (${response.status}).`);
      error.status = response.status;
      error.retryAfter = response.headers.get('Retry-After');
      throw error;
    }

    const payload = await response.json();
    return Array.isArray(payload.elements) ? payload.elements : [];
  }

  function elementCoordinate(element) {
    const lat = Number(element.lat ?? element.center?.lat);
    const lon = Number(element.lon ?? element.center?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  }

  function normalizePoiPassBys(element, categories, geometry, config) {
    const coordinate = elementCoordinate(element);
    const category = matchingCategory(element, categories);
    if (!coordinate || !category) return [];

    const graceM = getGraceMeters(category, config);
    const hardLimitM = category.radiusM;
    const softLimitM = hardLimitM + graceM;
    const physicalId = physicalPoiKey({ osmType: element.type, osmId: element.id });

    return projectPoiPassBys(coordinate, geometry, softLimitM).map((projection) => ({
      osmType: element.type,
      osmId: element.id,
      physicalPoiId: physicalId,
      passId: projection.passId,
      passIndex: projection.passIndex,
      passCount: projection.passCount,
      lat: coordinate.lat,
      lon: coordinate.lon,
      tags: element.tags || {},
      category,
      routeKm: projection.routeKm,
      offRouteM: projection.distanceM,
      status: projection.distanceM <= hardLimitM ? 'match' : 'near-miss',
      name: element.tags?.name || element.tags?.brand || category.label,
    }));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function physicalPassesFor(poi) {
    const physicalId = poi.physicalPoiId || physicalPoiKey(poi);
    return currentPois
      .filter((candidate) => (candidate.physicalPoiId || physicalPoiKey(candidate)) === physicalId)
      .sort((a, b) => a.routeKm - b.routeKm || a.offRouteM - b.offRouteM);
  }

  function nextPassBy(poi) {
    const passes = physicalPassesFor(poi);
    if (passes.length < 2) return null;
    const currentIndex = passes.findIndex((candidate) => poiKey(candidate) === poiKey(poi));
    return passes[(currentIndex + 1) % passes.length] || null;
  }

  function focusPoi(poi) {
    map.setView([poi.lat, poi.lon], Math.max(map.getZoom(), 15));
    poiMarkers.get(poiKey(poi))?.openPopup();
  }

  function jumpToPassBy(poi) {
    const target = nextPassBy(poi);
    if (!target) return;
    activeCategoryIds.add(target.category.id);
    const visiblePois = currentPois
      .filter((candidate) => activeCategoryIds.has(candidate.category.id))
      .sort((a, b) => a.routeKm - b.routeKm || a.offRouteM - b.offRouteM);
    const targetIndex = visiblePois.findIndex((candidate) => poiKey(candidate) === poiKey(target));
    if (targetIndex >= 0) poiPage = Math.floor(targetIndex / POI_LIST_PAGE_SIZE) + 1;
    renderCategoryControls(poiConfig);
    renderPois(currentPois, currentCategories);
    const targetId = poiKey(target);
    const targetItem = [...poiList.querySelectorAll('.poi-list-item')]
      .find((item) => item.dataset.poiId === targetId);
    targetItem?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusPoi(target);
  }

  function toggleSelection(poiId) {
    selectedPoiIds = togglePoiSelection(selectedPoiIds, poiId);
    renderPois(currentPois, currentCategories);
    renderRoutebook();
    renderWarnings();
  }

  function togglePin(poi) {
    const poiId = poiKey(poi);
    if (pinnedPoiIds.has(poiId)) {
      pinnedPoiIds.delete(poiId);
      pinnedPoiSnapshots.delete(poiId);
      if (poi.status === 'pinned') currentPois = currentPois.filter((candidate) => poiKey(candidate) !== poiId);
    } else {
      pinnedPoiIds.add(poiId);
      pinnedPoiSnapshots.set(poiId, { ...poi });
    }
    renderPois(currentPois, currentCategories);
    renderRoutebook();
    renderWarnings();
  }

  function renderRoutebook() {
    const routebook = buildRoutebook(currentPois, selectedPoiIds, currentRouteDistanceMeters, gapSettings);
    const hasRoute = currentRouteDistanceMeters > 0;
    const hasStops = routebook.stops.length > 0;
    const thresholds = routebook.gapThresholds || buildGapThresholds(gapSettings);
    routebookSummary.textContent = hasRoute
      ? `Longest section without a selected stop: ${formatDistance(routebook.longestGapM)}. Info > ${formatThresholdKm(thresholds.infoM)}, Warning > ${formatThresholdKm(thresholds.warningM)}, Critical > ${formatThresholdKm(thresholds.criticalM)}.`
      : 'Load a route to create a routebook.';
    routebookEmpty.hidden = hasStops || !hasRoute;
    routebookList.innerHTML = '';

    routebook.entries.forEach((entry) => {
      const item = document.createElement('li');
      const severityClass = entry.gapSeverity ? `gap-${entry.gapSeverity}` : '';
      item.className = `routebook-item ${entry.kind} ${severityClass} ${entry.isLongGap ? 'long-gap' : ''}`;
      if (entry.kind === 'stop') {
        const passText = entry.poi.passCount > 1 ? ` · Vorbeifahrt ${entry.poi.passIndex}/${entry.poi.passCount}` : '';
        const severityText = entry.gapSeverity ? ` · ${entry.gapSeverity.toUpperCase()}` : '';
        item.innerHTML = `
          <button type="button" class="routebook-focus">
            <span class="routebook-main"><strong>${escapeHtml(entry.poi.name)}</strong><small>${escapeHtml(entry.poi.category.label)} · ${formatRouteKm(entry.routeMeters)}${passText}</small></span>
            <span class="routebook-gap">${formatDistance(entry.distanceFromPreviousM)} from previous${severityText}</span>
          </button>
          <button type="button" class="routebook-remove" aria-label="Remove ${escapeHtml(entry.poi.name)} from routebook">Remove</button>
        `;
        item.querySelector('.routebook-focus').addEventListener('click', () => {
          setActiveTab('pois');
          focusPoi(entry.poi);
        });
        item.querySelector('.routebook-remove').addEventListener('click', () => toggleSelection(poiKey(entry.poi)));
      } else {
        const isStart = entry.kind === 'start';
        const severityText = entry.gapSeverity ? ` · ${entry.gapSeverity.toUpperCase()}` : '';
        item.innerHTML = `
          <span class="routebook-main"><strong>${entry.name}</strong><small>${formatRouteKm(entry.routeMeters)}</small></span>
          ${isStart ? '' : `<span class="routebook-gap">${formatDistance(entry.distanceFromPreviousM)} from previous${severityText}</span>`}
        `;
      }
      routebookList.appendChild(item);
    });
    routebookList.hidden = !hasStops;
  }

  function setActiveTab(tab) {
    activeTab = tab;
    const showPois = tab === 'pois';
    const showRoutebook = tab === 'routebook';
    poisTab.classList.toggle('is-active', showPois);
    poisTab.setAttribute('aria-selected', String(showPois));
    routebookTab.classList.toggle('is-active', showRoutebook);
    routebookTab.setAttribute('aria-selected', String(showRoutebook));
    poiPanel.hidden = !showPois;
    routebookPanel.hidden = !showRoutebook;
    renderMapPois();
    renderWarnings();
    renderWarningLayer();
    if (showRoutebook) renderRoutebook();
  }

  function clusterIcon(items) {
    const { background } = clusterRingStyle(items);
    const size = Math.min(56, 38 + Math.round(Math.sqrt(items.length) * 3));
    const label = clusterAccessibleLabel(items);
    return L.divIcon({
      className: 'poi-cluster-icon',
      html: `<div class="poi-cluster" style="--cluster-size:${size}px;--cluster-ring:${background}" role="img" aria-label="${escapeHtml(label)}"><span>${items.length}</span></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  function renderPoiMarker(poi, latLng = [poi.lat, poi.lon]) {
    const poiId = poiKey(poi);
    const statusText = poi.status === 'near-miss' ? 'Near miss' : (poi.status === 'pinned' ? 'Behalten aus vorheriger Suche' : 'Inside corridor');
    const selected = selectedPoiIds.has(poiId);
    const pinned = pinnedPoiIds.has(poiId);
    const nextPass = nextPassBy(poi);
    const passText = poi.passCount > 1 ? `<br>Vorbeifahrt ${poi.passIndex} von ${poi.passCount}` : '';
    const jumpButton = nextPass
      ? `<button type="button" class="popup-selection popup-pass-jump" data-pass-jump="${escapeHtml(poiId)}">Nächste Vorbeifahrt · km ${nextPass.routeKm.toFixed(1)}</button>`
      : '';
    const pinButton = `<button type="button" class="popup-selection popup-pin" data-pin-id="${escapeHtml(poiId)}">${pinned ? 'Pin lösen' : 'POI behalten'}</button>`;
    const popup = `
      <strong>${escapeHtml(poi.name)}</strong><br>
      ${escapeHtml(poi.category.label)} · km ${poi.routeKm.toFixed(1)}${passText}<br>
      ${Math.round(poi.offRouteM)} m off route · ${statusText}<br>
      <button type="button" class="popup-selection" data-poi-id="${escapeHtml(poiId)}">${selected ? 'Remove from routebook' : 'Add to routebook'}</button>
          ${pinButton}
      ${jumpButton}
    `;
    const marker = L.marker(latLng, { icon: poiMarkerIcon(poi), title: poi.name, keyboard: true }).bindPopup(popup).addTo(poiLayer);
    marker.on('popupopen', () => {
      const selectionButton = map.getContainer().querySelector(`[data-poi-id="${poiId}"]`);
      selectionButton?.addEventListener('click', () => toggleSelection(poiId), { once: true });
      const pinButton = map.getContainer().querySelector(`[data-pin-id="${poiId}"]`);
      pinButton?.addEventListener('click', () => togglePin(poi), { once: true });
      const passButton = map.getContainer().querySelector(`[data-pass-jump="${poiId}"]`);
      passButton?.addEventListener('click', () => jumpToPassBy(poi), { once: true });
    });
    poiMarkers.set(poiId, marker);
  }

  function gapSeverityColor(severity) {
    if (severity === 'critical') return '#a33d32';
    if (severity === 'warning') return '#ad6717';
    return '#d6902f';
  }

  function activeFoundResupplyPois() {
    const visible = currentPois.filter((poi) => activeCategoryIds.has(poi.category.id) && poi.status !== 'pinned');
    return filterReliableResupplyPois(visible, resupplyProfile);
  }

  function renderWarningLayer() {
    warningLayer.clearLayers();
    if (!currentParsedRoute) return;
    if (activeTab !== 'routebook' && (poiSearchRunning || (poiSectionStatus.started && (poiSectionStatus.failed.size > 0 || poiSectionStatus.completed < poiSectionStatus.total)))) return;
    const reliableSelected = filterReliableSelectedPoiIds(currentPois, selectedPoiIds, resupplyProfile, poiKey);
    const { warnings } = activeTab === 'routebook'
      ? buildRoutebookWarnings(filterReliableResupplyPois(currentPois, resupplyProfile), reliableSelected, currentRouteDistanceMeters, gapSettings)
      : buildFoundPoiWarnings(activeFoundResupplyPois(), currentRouteDistanceMeters, gapSettings);
    warnings.forEach((warning) => {
      const geometry = extractRouteGeometryRange(currentParsedRoute, warning.startMeters, warning.endMeters);
      geometry.forEach((line) => L.polyline(line, { color: gapSeverityColor(warning.severity), weight: 8, opacity: 0.78, interactive: false }).addTo(warningLayer));
    });
  }

  function renderWarnings() {
    if (!currentParsedRoute) {
      poiWarningSummary.hidden = true;
      poiWarningList.hidden = true;
      renderWarningLayer();
      return;
    }
    if (activeTab !== 'routebook' && poiSearchRunning) {
      poiWarningSummary.hidden = false;
      poiWarningSummary.className = 'warning-summary is-pending';
      poiWarningSummary.textContent = 'Versorgungslücken werden geprüft …';
      poiWarningList.hidden = true;
      poiWarningList.innerHTML = '';
      renderWarningLayer();
      return;
    }
    if (activeTab !== 'routebook' && poiSectionStatus.started && (poiSectionStatus.failed.size > 0 || poiSectionStatus.completed < poiSectionStatus.total)) {
      poiWarningSummary.hidden = false;
      poiWarningSummary.className = 'warning-summary is-incomplete';
      poiWarningSummary.textContent = `Prüfung unvollständig – ${failedPoiSections.length} Suchpaket${failedPoiSections.length === 1 ? '' : 'e'} konnten selbst nach automatischer Verkleinerung nicht geladen werden.`;
      poiWarningList.hidden = true;
      poiWarningList.innerHTML = '';
      renderWarningLayer();
      return;
    }

    const reliableSelected = filterReliableSelectedPoiIds(currentPois, selectedPoiIds, resupplyProfile, poiKey);
    const result = activeTab === 'routebook'
      ? buildRoutebookWarnings(filterReliableResupplyPois(currentPois, resupplyProfile), reliableSelected, currentRouteDistanceMeters, gapSettings)
      : buildFoundPoiWarnings(activeFoundResupplyPois(), currentRouteDistanceMeters, gapSettings);
    const { warnings, longestGapM, gapThresholds } = result;
    const foundCount = result.foundCount ?? reliableSelected.size;
    const counts = { info: 0, warning: 0, critical: 0 };
    warnings.forEach((warning) => { counts[warning.severity] += 1; });
    poiWarningSummary.hidden = false;
    poiWarningSummary.className = 'warning-summary';
    poiWarningSummary.textContent = `${warnings.length} Versorgungslücke${warnings.length === 1 ? '' : 'n'} ab Info-Schwelle; ${counts.info} Info, ${counts.warning} Warning, ${counts.critical} Critical. Längster Abschnitt: ${formatDistance(longestGapM)}. Grundlage: ${foundCount} verlässliche Versorgungspunkte. Schwellen: ${formatThresholdKm(gapThresholds.infoM)} / ${formatThresholdKm(gapThresholds.warningM)} / ${formatThresholdKm(gapThresholds.criticalM)}. Near misses zählen nicht.`;
    poiWarningList.innerHTML = '';
    poiWarningList.hidden = warnings.length === 0;
    warnings.forEach((warning) => {
      const item = document.createElement('li');
      item.className = `warning-item severity-${warning.severity}`;
      item.innerHTML = `<span><strong>${warning.severity.toUpperCase()} · ${escapeHtml(warning.from)} → ${escapeHtml(warning.to)}</strong><small>${formatDistance(warning.lengthM)} ohne gefundenen POI</small></span><button class="warning-focus" type="button">Focus</button>`;
      item.querySelector('button').addEventListener('click', () => {
        const geometry = extractRouteGeometryRange(currentParsedRoute, warning.startMeters, warning.endMeters);
        const points = geometry.flat();
        if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 13 });
      });
      poiWarningList.appendChild(item);
    });
    renderWarningLayer();
  }

  function spiderfyCluster(cluster) {
    const center = map.latLngToLayerPoint([cluster.center.lat, cluster.center.lon]);
    const radius = Math.max(32, Math.min(70, cluster.items.length * 8));
    poiLayer.removeLayer(cluster.marker);
    cluster.items.forEach((poi, index) => {
      const angle = (index / cluster.items.length) * Math.PI * 2;
      const point = map.layerPointToLatLng([center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius]);
      renderPoiMarker(poi, point);
    });
  }

  function renderMapPois() {
    poiLayer.clearLayers();
    poiMarkers.clear();
    if (activeTab === 'routebook') {
      currentPois.filter((poi) => selectedPoiIds.has(poiKey(poi))).forEach((poi) => renderPoiMarker(poi));
      return;
    }
    const visiblePois = currentPois.filter((poi) => activeCategoryIds.has(poi.category.id) || pinnedPoiIds.has(poiKey(poi)));
    const mapPois = visiblePois.concat(currentPois.filter((poi) => !activeCategoryIds.has(poi.category.id) && !pinnedPoiIds.has(poiKey(poi)) && selectedPoiIds.has(poiKey(poi))));
    const selected = mapPois.filter((poi) => selectedPoiIds.has(poiKey(poi)));
    selected.forEach((poi) => renderPoiMarker(poi));
    const clusterable = mapPois.filter((poi) => !selectedPoiIds.has(poiKey(poi)));
    const clusters = map.getZoom() >= POI_CLUSTER_DISABLE_ZOOM
      ? clusterable.map((poi) => ({ items: [poi], isCluster: false, center: { lat: poi.lat, lon: poi.lon } }))
      : clusterPoiData(clusterable, (poi) => map.latLngToLayerPoint([poi.lat, poi.lon]), POI_CLUSTER_RADIUS_PX);
    clusters.forEach((cluster) => {
      if (!cluster.isCluster) {
        renderPoiMarker(cluster.items[0]);
        return;
      }
      const marker = L.marker([cluster.center.lat, cluster.center.lon], { icon: clusterIcon(cluster.items), title: clusterAccessibleLabel(cluster.items), keyboard: true }).addTo(poiLayer);
      cluster.marker = marker;
      marker.on('click', () => {
        if (map.getZoom() >= POI_CLUSTER_SPIDERFY_ZOOM) spiderfyCluster(cluster);
        else map.fitBounds(L.latLngBounds(cluster.items.map((poi) => [poi.lat, poi.lon])), { maxZoom: Math.min(map.getMaxZoom(), map.getZoom() + 2), padding: [36, 36] });
      });
    });
  }

  function renderPois(pois, categories) {
    currentPois = pois;
    currentCategories = categories;
    const visiblePois = pois
      .filter((poi) => activeCategoryIds.has(poi.category.id) || pinnedPoiIds.has(poiKey(poi)))
      .sort((a, b) => a.routeKm - b.routeKm || a.offRouteM - b.offRouteM);
    const page = paginatePois(visiblePois, poiPage);
    poiPage = page.page;
    renderMapPois();

    const allCategories = poiConfig?.categories || categories;
    const counts = Object.fromEntries(allCategories.map((category) => [category.id, 0]));
    pois.forEach((poi) => { counts[poi.category.id] = (counts[poi.category.id] || 0) + 1; });
    poiCategories.querySelectorAll('[data-category-count]').forEach((node) => {
      node.textContent = String(counts[node.dataset.categoryCount] || 0);
    });

    poiTotal.textContent = String(visiblePois.length);
    poiTotal.hidden = false;
    poiCategories.hidden = false;
    poiLegend.hidden = false;

    poiCategories.querySelectorAll('.category-row').forEach((row) => {
      const active = activeCategoryIds.has(row.dataset.category);
      row.classList.toggle('is-inactive', !active);
      row.querySelector('.category-toggle')?.setAttribute('aria-pressed', String(active));
    });

    poiList.innerHTML = '';
    page.items.forEach((poi) => {
      const poiId = poiKey(poi);
      const nextPass = nextPassBy(poi);
      const passText = poi.passCount > 1 ? ` · Vorbeifahrt ${poi.passIndex}/${poi.passCount}` : '';
      const pinned = pinnedPoiIds.has(poiId);
      const item = document.createElement('li');
      item.dataset.poiId = poiId;
      item.className = `poi-list-item ${poi.status === 'near-miss' ? 'near-miss' : ''} ${pinned ? 'pinned' : ''} ${selectedPoiIds.has(poiId) ? 'selected' : ''}`;
      item.innerHTML = `
        <div class="poi-list-primary">
          <button type="button" class="poi-list-button">
            <span class="poi-list-main"><strong>${escapeHtml(poi.name)}</strong><small>${escapeHtml(poi.category.label)} · ${Math.round(poi.offRouteM)} m off route${passText}</small></span>
            <span class="route-km">km ${poi.routeKm.toFixed(1)}</span>
          </button>
          ${nextPass ? `<button type="button" class="poi-pass-jump">Nächste Vorbeifahrt · km ${nextPass.routeKm.toFixed(1)}</button>` : ''}
        </div>
        <button type="button" class="poi-pin">${pinned ? 'Pin lösen' : 'Behalten'}</button>
        <button type="button" class="poi-selection">${selectedPoiIds.has(poiId) ? 'Remove' : 'Add'}</button>
      `;
      item.querySelector('.poi-list-button').addEventListener('click', () => focusPoi(poi));
      item.querySelector('.poi-pin').addEventListener('click', () => togglePin(poi));
      item.querySelector('.poi-selection').addEventListener('click', () => toggleSelection(poiId));
      item.querySelector('.poi-pass-jump')?.addEventListener('click', () => jumpToPassBy(poi));
      poiList.appendChild(item);
    });
    poiList.hidden = page.items.length === 0;
    poiPagination.hidden = visiblePois.length === 0 || page.totalPages <= 1;
    poiPageSummary.textContent = visiblePois.length === 0 ? '' : `${page.startIndex + 1}–${page.endIndex} von ${visiblePois.length} POIs`;
    poiPageNumber.textContent = `Seite ${page.page} von ${page.totalPages}`;
    poiPrevious.disabled = page.page === 1;
    poiNext.disabled = page.page === page.totalPages;
    if (activeCategoryIds.size === 0 && visiblePois.length === 0) {
      poiEmpty.textContent = 'Keine POI-Kategorie ausgewählt.';
      poiEmpty.hidden = false;
    } else if (visiblePois.length === 0) {
      poiEmpty.textContent = 'Keine POIs in den ausgewählten Kategorien gefunden.';
      poiEmpty.hidden = false;
    } else {
      poiEmpty.hidden = true;
    }

    const nearMissCount = visiblePois.filter((poi) => poi.status === 'near-miss').length;
    setPoiStatus(
      visiblePois.length === 0
        ? (activeCategoryIds.size === 0 ? 'Keine POI-Kategorie ausgewählt.' : 'No POIs were found in the enabled categories inside the current route corridors.')
        : `${visiblePois.length} useful stop${visiblePois.length === 1 ? '' : 's'} found in route order${nearMissCount ? `, including ${nearMissCount} near miss${nearMissCount === 1 ? '' : 'es'}` : ''}.`,
    );
  }

  async function loadPois(parsed, preserveSelection = false, retryFailedOnly = false) {
    if (poiSearchRunning) return;
    const previousSelection = preserveSelection ? new Set(selectedPoiIds) : new Set();
    const previousPins = preserveSelection ? new Set(pinnedPoiIds) : new Set();
    const previousPinnedSnapshots = preserveSelection
      ? new Map(currentPois.filter((poi) => previousPins.has(poiKey(poi))).map((poi) => [poiKey(poi), { ...poi }]))
      : new Map();
    setPoiSearchRunning(true);
    poiAbortController?.abort();
    poiAbortController = new AbortController();
    const { signal } = poiAbortController;
    if (!retryFailedOnly) clearPoiUi();
    selectedPoiIds = previousSelection;
    pinnedPoiIds = previousPins;
    pinnedPoiSnapshots = previousPinnedSnapshots;
    setPoiStatus('Reading POI configuration…');

    try {
      const [config] = await Promise.all([getPoiConfig(), getResupplyProfile()]);
      if (signal.aborted) return;

      const categories = buildActiveCategories(config, activeCategoryIds, categoryRadiusOverrides);
      poiCategories.hidden = false;
      if (categories.length === 0) {
        failedPoiSections = [];
        poiSectionStatus = { total: 0, completed: 0, failed: new Set(), started: true };
        const pinnedFallbacks = [...pinnedPoiSnapshots.values()].map((poi) => ({ ...poi, status: 'pinned' }));
        renderPois(pinnedFallbacks, config.categories);
        return;
      }

      const geometry = buildRouteGeometry(parsed);
      const pinnedFallbacks = [...pinnedPoiSnapshots.entries()].map(([id, poi]) => [id, { ...poi, status: 'pinned' }]);
      const deduped = new Map([...(retryFailedOnly ? currentPois : []).map((poi) => [poiKey(poi), poi]), ...pinnedFallbacks]);
      const workloads = retryFailedOnly
        ? [...failedPoiSections]
        : createPoiQueryWorkloads(currentPoiSections, categories);
      const failedWorkloads = [];
      poiSectionStatus = { total: workloads.length, completed: 0, failed: new Set(), started: true };

      for (let workloadPosition = 0; workloadPosition < workloads.length; workloadPosition += 1) {
        const workload = workloads[workloadPosition];
        const section = workload.section;
        const workloadCategories = workload.categories;
        if (signal.aborted) return;
        setPoiStatus(`POIs werden gesucht: Suchpaket ${poiSectionStatus.completed + 1} von ${poiSectionStatus.total}`);
        try {
          let rateLimited = false;
          const candidates = await fetchPoiSectionWithRetry(
            (currentSection, currentSignal) => fetchOsmCandidates(workloadCategories, currentSection, config, currentSignal),
            section,
            {
              signal,
              onBackoff: (delay, error) => {
                rateLimited = Number(error?.status) === 429;
              },
              sleep: (delay) => waitForPoiBackoff(delay, section, signal, rateLimited),
            },
          );
          if (!candidates) return;
          candidates.forEach((element) => {
            normalizePoiPassBys(element, workloadCategories, geometry, config).forEach((poi) => {
              const key = poiKey(poi);
              const existing = deduped.get(key);
              if (!existing || existing.status === 'pinned' || poi.offRouteM < existing.offRouteM) {
                deduped.set(key, poi);
                if (pinnedPoiIds.has(key)) pinnedPoiSnapshots.set(key, { ...poi });
              }
            });
          });
          poiSectionStatus.completed += 1;
          poiSectionStatus.failed.delete(workload.id);
        } catch (error) {
          if (error?.name === 'AbortError') return;
          const replacements = Number(error?.status) === 504 ? splitPoiQueryWorkload(workload) : [];
          if (replacements.length > 0) {
            poiSectionStatus.total += replacements.length - 1;
            workloads.splice(workloadPosition + 1, 0, ...replacements);
            setPoiStatus('Ein Suchpaket war zu groß und wird automatisch weiter aufgeteilt.');
            continue;
          }
          failedWorkloads.push(workload);
          poiSectionStatus.failed.add(workload.id);
          poiSectionStatus.completed += 1;
          console.error(error);
        }
        if (workloadPosition < workloads.length - 1) await waitForPoiBackoff(1000, section, signal);
      }

      const pois = Array.from(deduped.values()).sort((a, b) => a.routeKm - b.routeKm || a.offRouteM - b.offRouteM);
      selectedPoiIds = new Set([...selectedPoiIds].filter((id) => pois.some((poi) => poiKey(poi) === id)));
      pinnedPoiIds = new Set([...pinnedPoiIds].filter((id) => pois.some((poi) => poiKey(poi) === id)));
      failedPoiSections = failedWorkloads;
      renderPois(pois, config.categories);
      setPoiStatus(
        failedWorkloads.length > 0
          ? `POI-Suche teilweise erfolgreich: ${failedWorkloads.length} Suchpaket${failedWorkloads.length === 1 ? '' : 'e'} endgültig fehlgeschlagen. ${pois.length} POIs aus erfolgreichen Paketen verfügbar.`
          : `${pois.length} POIs vollständig geladen (${poiSectionStatus.completed} Suchpakete verarbeitet).`,
      );
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error(error);
      setPoiStatus('The route is loaded, but the POI lookup failed. You can keep using the route view and try again with another GPX later.');
      showError(error instanceof Error ? error.message : 'Could not load route POIs.');
    } finally {
      if (!signal.aborted) setPoiSearchRunning(false);
    }
  }

  async function loadFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.gpx')) {
      showError('Please choose a .gpx file.');
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseGpx(text);
      renderRoute(parsed, file.name);
      await loadPois(parsed);
    } catch (error) {
      console.error(error);
      showError(error instanceof Error ? error.message : 'Could not read this GPX file.');
    }
  }

  fileInput.addEventListener('change', (event) => loadFile(event.target.files?.[0]));
  replaceRoute.addEventListener('click', () => fileInput.click());
  reloadPois.addEventListener('click', () => currentParsedRoute && loadPois(currentParsedRoute, true, failedPoiSections.length > 0));
  gapSettingInputs.forEach((input) => input.addEventListener('input', applyGapSettingsFromInputs));
  poiCategories.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category-toggle]');
    if (!button) return;
    const categoryId = button.dataset.categoryToggle;
    const enabling = !activeCategoryIds.has(categoryId);
    if (enabling) activeCategoryIds.add(categoryId);
    else activeCategoryIds.delete(categoryId);
    poiPage = 1;
    if (poiConfig) renderCategoryControls(poiConfig);
    if (enabling && currentParsedRoute) {
      loadPois(currentParsedRoute, true, false);
    } else {
      renderPois(currentPois, currentCategories);
      renderWarnings();
      renderWarningLayer();
    }
  });
  poiCategories.addEventListener('change', (event) => {
    const input = event.target.closest('[data-category-radius]');
    if (!input) return;
    const categoryId = input.dataset.categoryRadius;
    const fallback = categoryRadiusOverrides.get(categoryId) || poiConfig?.categories.find((category) => category.id === categoryId)?.defaultRadiusM || 250;
    const radiusM = Number(input.value);
    if (!Number.isFinite(radiusM) || radiusM <= 0) {
      input.value = String(fallback);
      return;
    }
    categoryRadiusOverrides.set(categoryId, radiusM);
    if (activeCategoryIds.has(categoryId) && currentParsedRoute) loadPois(currentParsedRoute, true, false);
  });
  poiPrevious.addEventListener('click', () => {
    poiPage -= 1;
    renderPois(currentPois, currentCategories);
  });
  poiNext.addEventListener('click', () => {
    poiPage += 1;
    renderPois(currentPois, currentCategories);
  });
  poisTab.addEventListener('click', () => setActiveTab('pois'));
  routebookTab.addEventListener('click', () => setActiveTab('routebook'));
  map.on('zoomend', () => renderMapPois());

  ['dragenter', 'dragover'].forEach((type) => {
    window.addEventListener(type, (event) => {
      event.preventDefault();
      if (!dropZone.hidden) dropZone.classList.add('is-dragging');
    });
  });

  ['dragleave', 'drop'].forEach((type) => {
    window.addEventListener(type, (event) => {
      event.preventDefault();
      dropZone.classList.remove('is-dragging');
    });
  });

  window.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) loadFile(file);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !routeCard.hidden) clearRoute();
  });

  renderGapSettingsPreview();
  Promise.all([getPoiConfig(), getResupplyProfile()]).catch((error) => {
    console.error(error);
    showError(error instanceof Error ? error.message : 'Could not load Bonkproof configuration.');
  });
})();
