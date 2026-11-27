import { DEFAULT_GAP_SETTINGS, buildFoundPoiWarnings, buildGapThresholds, buildRoutebook, buildRoutebookWarnings, extractRouteGeometryRange, normalizeGapSettings, poiKey, togglePoiSelection } from './routebook.js';
import { buildPoiQuerySections, buildScopedPoiQuerySections, createPoiQueryWorkloads, fetchPoiSectionWithRetry, mergeScopedPoiResults, paginatePois, POI_LIST_PAGE_SIZE, preservePoiSelections, searchScopedPoiWorkloads, splitPoiQueryWorkload } from './poi-search.js';
import { clusterAccessibleLabel, clusterPoiData, clusterRingStyle, POI_CLUSTER_DISABLE_ZOOM, POI_CLUSTER_RADIUS_PX, POI_CLUSTER_SPIDERFY_ZOOM } from './poi-clustering.js';
import { buildRouteGeometry, physicalPoiKey, projectPoiPassBys } from './poi-projection.js';
import { buildPoiPassIndex } from './poi-pass-index.js';
import { buildActiveCategories, buildOverpassQuery, categoryRadiusIsLoaded, defaultCategoryRadii, defaultEnabledCategoryIds, effectivePoiState, getGraceMeters, matchingCategory, poiInsideEffectiveCorridor } from './poi-config.js';
import { filterReliableResupplyPois, filterReliableSelectedPoiIds, foundResupplyPois } from './resupply-profile.js';
import { buildRoutePointSnapshots } from './export-model.js';
import { createExportFile, downloadExportFile, sanitizeExportBaseName } from './export-core.js';
import { EXPORT_FORMATS, EXPORT_TARGET_PROFILES, availableExportFormats, getExportProfile } from './export-profiles.js';
import { buildCriticalGapExportPoints } from './export-gap-warnings.js';
import { PROJECT_FILE_MAX_BYTES, PROJECT_GPX_MAX_CHARS, snapshotProjectPoi, validateProject } from './project-format.js';
import { createProjectStore } from './project-store.js';
import { mountProjectWorkspace } from './project-workspace.js';
import { mountPwa } from './pwa.js';

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
  const routebookWarningOverview = document.getElementById('routebook-warning-overview');
  const routebookSummary = document.getElementById('routebook-summary');
  const routebookEmpty = document.getElementById('routebook-empty');
  const routebookList = document.getElementById('routebook-list');
  const exportTab = document.getElementById('export-tab');
  const exportPanel = document.getElementById('export-panel');
  const exportTarget = document.getElementById('export-target');
  const exportFormat = document.getElementById('export-format');
  const exportSelectionSummary = document.getElementById('export-selection-summary');
  const exportCompatibility = document.getElementById('export-compatibility');
  const exportFilename = document.getElementById('export-filename');
  const exportVerification = document.getElementById('export-verification');
  const exportDownload = document.getElementById('export-download');
  const exportGapWarnings = document.getElementById('export-gap-warnings');
  const poiWarningOverview = document.getElementById('poi-warning-overview');
  const poiWarningSummary = document.getElementById('poi-warning-summary');
  const poiWarningList = document.getElementById('poi-warning-list');
  const scopedSearch = document.getElementById('scoped-poi-search');
  const scopedHeading = document.getElementById('scoped-poi-heading');
  const scopedRange = document.getElementById('scoped-poi-range');
  const scopedForm = document.getElementById('scoped-poi-form');
  const scopedCategories = document.getElementById('scoped-poi-categories');
  const scopedSubmit = document.getElementById('scoped-poi-submit');
  const scopedCancel = document.getElementById('scoped-poi-cancel');
  const scopedStatus = document.getElementById('scoped-poi-status');
  const scopedReview = document.getElementById('scoped-poi-review');
  const scopedResults = document.getElementById('scoped-poi-results');
  const connectionStatus = document.getElementById('connection-status');
  const poiConnectionStatus = document.getElementById('poi-connection-status');
  const mapBackgroundStatus = document.getElementById('map-background-status');
  const reloadPois = document.getElementById('reload-pois');
  const iceToggle = document.getElementById('ice-toggle');
  const iceStatus = document.getElementById('ice-status');
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

  const basemap = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  });
  let tileFailed = false;
  basemap.on('loading', () => { tileFailed = false; });
  basemap.on('tileerror', () => {
    tileFailed = true;
    renderMapBackground();
  });
  basemap.on('load', renderMapBackground);

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
  let projectWorkspace;
  let defaultResupplyProfile;
  let currentSourceGpxText = null;
  let currentRouteFileName = null;
  let poiSearchRunning = false;
  let routeLoadRequest = 0;
  let routeFileReading = false;
  const pendingCategoryIds = new Set();
  let scopedGap = null;
  let scopedController = null;
  let scopedCandidates = new Map();
  const acceptedScopedPois = new Map();
  const scopedConfigurations = new Map();
  let currentPoiSections = [];
  let failedPoiSections = [];
  let poiSectionStatus = { total: 0, completed: 0, failed: new Set(), started: false };
  let poiPage = 1;
  let activeCategoryIds = new Set(INITIAL_CATEGORY_IDS);
  let loadedCategoryRadii = new Map();
  let iceActive = false;
  let activeTab = 'pois';
  let gapSettings = { ...DEFAULT_GAP_SETTINGS };
  const poiMarkers = new Map();
  let poiPassIndex = new Map();

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
    poiPassIndex = new Map();
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

  function isOffline() {
    return navigator.onLine === false;
  }

  function setPoiConnection(message) {
    poiConnectionStatus.textContent = message;
    poiConnectionStatus.hidden = !message;
  }

  function renderMapBackground() {
    const unavailable = isOffline() || tileFailed;
    map.getContainer().classList.toggle('map-offline', unavailable);
    mapBackgroundStatus.textContent = unavailable ? 'Hintergrundkarte nicht verfügbar. Route und gespeicherte POIs bleiben sichtbar.' : '';
    mapBackgroundStatus.hidden = !unavailable;
  }

  function renderConnectivity() {
    const offline = isOffline();
    connectionStatus.textContent = offline ? 'Offline · Externe POI-Suche nicht verfügbar' : 'Online';
    if (offline && map.hasLayer(basemap)) map.removeLayer(basemap);
    else if (!offline && !map.hasLayer(basemap)) basemap.addTo(map);
    reloadPois.disabled = offline || poiSearchRunning || !currentParsedRoute;
    scopedSubmit.disabled = offline || Boolean(scopedController);
    renderMapBackground();
  }

  function setPoiSearchRunning(running) {
    poiSearchRunning = running;
    projectWorkspace?.availabilityChanged();
    scopedReview.querySelector('button[type="submit"]').disabled = running;
    reloadPois.disabled = running || !currentParsedRoute || isOffline();
    const incomplete = poiSectionStatus.started && (poiSectionStatus.failed.size > 0 || poiSectionStatus.completed < poiSectionStatus.total);
    reloadPois.textContent = running
      ? 'POIs werden gesucht…'
      : (incomplete && failedPoiSections.length ? 'Fehlgeschlagene Suchpakete erneut laden' : 'POIs neu laden');
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
    loadedCategoryRadii = new Map();
    iceActive = false;
    renderIceControl();
    if (poiConfig) renderCategoryControls(poiConfig);
  }

  function clearRoute() {
    routeLoadRequest += 1;
    routeFileReading = false;
    setPoiConnection('');
    pendingCategoryIds.clear();
    poiAbortController?.abort();
    resetScopedSearch();
    routeLayer.clearLayers();
    pinnedPoiIds = new Set();
    pinnedPoiSnapshots = new Map();
    currentParsedRoute = null;
    currentSourceGpxText = null;
    currentRouteFileName = null;
    currentPoiSections = [];
    failedPoiSections = [];
    poiSectionStatus = { total: 0, completed: 0, failed: new Set(), started: false };
    resetPoiViewState();
    clearPoiUi();
    resetRoutebook();
    routeCard.hidden = true;
    dropZone.hidden = false;
    exportTab.disabled = true;
    exportGapWarnings.checked = false;
    if (activeTab === 'export') setActiveTab('pois');
    renderExportPanel();
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
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return null;
    }
    return { lat, lon };
  }

  function parseGpx(xmlText) {
    if (/<!DOCTYPE/i.test(xmlText)) throw new Error('GPX mit Dokumenttyp-Deklaration wird nicht unterstützt.');
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
      projectWorkspace.changed();
      gapSettingsError.hidden = true;
      gapSettingsError.textContent = '';
      gapSettingInputs.forEach((input) => input.removeAttribute('aria-invalid'));
      renderGapSettingsPreview();
  renderExportPanel();
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

  function renderRoute(parsed, fileName, sourceGpxText) {
    pendingCategoryIds.clear();
    poiAbortController?.abort();
    resetScopedSearch();
    poiSearchRunning = false;
    routeLayer.clearLayers();
    clearPoiUi();
    selectedPoiIds = new Set();
    pinnedPoiIds = new Set();
    pinnedPoiSnapshots = new Map();
    currentRouteDistanceMeters = parsed.distanceMeters;
    currentParsedRoute = parsed;
    currentSourceGpxText = sourceGpxText;
    currentRouteFileName = fileName;
    currentPoiSections = [];
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
    exportTab.disabled = false;
    exportGapWarnings.checked = false;
    renderRoutebook();
    renderExportPanel();
  }

  function buildCurrentRouteExport(format) {
    if (!currentParsedRoute || !currentSourceGpxText) {
      throw new Error('No GPX route is loaded.');
    }
    const routePoints = buildRoutePointSnapshots(currentPois, {
      selectedPoiIds,
      pinnedPoiIds,
      poiKey,
    });
    if (exportGapWarnings.checked) {
      const reliableSelected = filterReliableSelectedPoiIds(currentPois, selectedPoiIds, resupplyProfile, poiKey);
      routePoints.push(...buildCriticalGapExportPoints({
        parsedRoute: currentParsedRoute,
        pois: filterReliableResupplyPois(currentPois, resupplyProfile),
        selectedPoiIds: reliableSelected,
        routeDistanceMeters: currentRouteDistanceMeters,
        gapSettings,
        enabled: true,
      }));
    }
    return createExportFile(format, {
      sourceGpx: currentSourceGpxText,
      fileName: currentRouteFileName,
      routeName: currentParsedRoute.name || currentRouteFileName,
      routeDistanceMeters: currentRouteDistanceMeters,
      routePointCount: currentParsedRoute.pointCount,
      segments: currentParsedRoute.segments,
      routePoints,
    });
  }

  function downloadCurrentRouteExport(format) {
    downloadExportFile(buildCurrentRouteExport(format));
  }

  function populateExportTargets() {
    if (exportTarget.options.length > 0) return;
    EXPORT_TARGET_PROFILES.forEach((profile) => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.label;
      exportTarget.appendChild(option);
    });
  }

  function syncExportFormats(profileId) {
    const available = availableExportFormats(profileId);
    const previous = exportFormat.value;
    exportFormat.innerHTML = '';
    available.forEach((formatId) => {
      const option = document.createElement('option');
      option.value = formatId;
      option.textContent = EXPORT_FORMATS[formatId]?.label || formatId.toUpperCase();
      exportFormat.appendChild(option);
    });
    if (available.includes(previous)) exportFormat.value = previous;
  }

  function renderExportPanel() {
    populateExportTargets();
    const hasRoute = Boolean(currentParsedRoute && currentSourceGpxText);
    if (!exportTarget.value) exportTarget.value = 'generic';
    const profile = getExportProfile(exportTarget.value);
    syncExportFormats(profile.id);
    const formatId = exportFormat.value || profile.formats[0];
    const format = EXPORT_FORMATS[formatId];
    const selectedCount = selectedPoiIds.size;
    const warningCount = hasRoute && exportGapWarnings.checked
      ? buildCriticalGapExportPoints({
        parsedRoute: currentParsedRoute,
        pois: filterReliableResupplyPois(currentPois, resupplyProfile),
        selectedPoiIds: filterReliableSelectedPoiIds(currentPois, selectedPoiIds, resupplyProfile, poiKey),
        routeDistanceMeters: currentRouteDistanceMeters,
        gapSettings,
        enabled: true,
      }).length
      : 0;

    const stopSummary = selectedCount > 0
      ? `${selectedCount} selected stop${selectedCount === 1 ? '' : 's'} will be included in route order.`
      : 'No stops selected. The route can still be exported without Bonkproof stop points.';
    const warningSummary = exportGapWarnings.checked
      ? ` ${warningCount} critical supply-gap warning point${warningCount === 1 ? '' : 's'} will also be included.`
      : '';

    exportSelectionSummary.textContent = hasRoute
      ? `${stopSummary}${warningSummary}`
      : 'Load a route to export it.';

    exportCompatibility.textContent = `${profile.note} ${format?.note || ''}`.trim();
    exportVerification.textContent = profile.verificationStatus === 'confirmed'
      ? 'Confirmed'
      : (profile.verificationStatus === 'expected' ? 'Expected / not confirmed' : 'Unknown');

    exportFilename.textContent = hasRoute
      ? (formatId === 'trackkin'
        ? `${sanitizeExportBaseName(currentRouteFileName || currentParsedRoute.name)}-trackkin.json`
        : `${sanitizeExportBaseName(currentRouteFileName || currentParsedRoute.name)}-bonkproof.${formatId}`)
      : '—';
    exportDownload.disabled = !hasRoute;
  }

  function currentEffectivePoiState() {
    return effectivePoiState(
      poiConfig,
      activeCategoryIds,
      categoryRadiusOverrides,
      iceActive ? poiConfig?.presets?.ice : null,
    );
  }

  function effectiveCategoryRadiusMeters(categoryId) {
    const state = currentEffectivePoiState();
    const configured = poiConfig?.categories.find((category) => category.id === categoryId);
    return Number(state.radiusOverrides.get(categoryId) ?? configured?.defaultRadiusM ?? 0);
  }

  function renderIceControl() {
    const preset = poiConfig?.presets?.ice;
    iceToggle.hidden = !preset;
    iceToggle.classList.toggle('is-active', iceActive);
    iceToggle.setAttribute('aria-pressed', String(iceActive));
    iceToggle.textContent = iceActive ? 'ICE-Modus beenden' : (preset?.label || 'ICE — In Case of Emergency');
    iceStatus.hidden = !iceActive;
    iceStatus.textContent = iceActive
      ? 'Temporärer Suchmodus aktiv: zusätzliche Kategorien und größere Suchradien. Deine normalen Einstellungen bleiben unverändert. Keine Sicherheits- oder Versorgungsgarantie.'
      : '';
  }

  function renderCategoryControls(config) {
    poiCategories.innerHTML = '';
    config.categories.forEach((category) => {
      const effectiveState = currentEffectivePoiState();
      const active = effectiveState.enabledIds.has(category.id);
      const radiusM = categoryRadiusOverrides.get(category.id) ?? category.defaultRadiusM;
      const effectiveRadiusM = effectiveState.radiusOverrides.get(category.id) ?? radiusM;
      const row = document.createElement('div');
      row.className = `category-row ${active ? '' : 'is-inactive'}`;
      row.dataset.category = category.id;
      row.innerHTML = `
        <button type="button" class="category-toggle" aria-pressed="${active}" data-category-toggle="${escapeHtml(category.id)}">
          <span class="category-symbol ${category.id === 'fuel' ? 'fuel' : ''}" aria-hidden="true">${escapeHtml(categorySymbol(category))}</span>
          <span class="category-copy"><strong>${escapeHtml(category.label)}</strong><small>${escapeHtml(category.group || 'other')}</small></span>
          <span class="category-count" data-category-count="${escapeHtml(category.id)}">0</span>
        </button>
        <label class="category-radius"><span>Radius${iceActive && effectiveRadiusM > radiusM ? ` · ICE ${effectiveRadiusM} m` : ''}</span><span><input type="number" min="50" max="20000" step="50" value="${radiusM}" data-category-radius="${escapeHtml(category.id)}"> m</span></label>
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
      }).catch((error) => {
        poiConfigPromise = null;
        throw error;
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
        defaultResupplyProfile = profile;
        resupplyProfile = profile;
        return profile;
      }).catch((error) => {
        resupplyProfilePromise = null;
        throw error;
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

  function categoryRadiusMeters(categoryId) {
    const configured = poiConfig?.categories.find((category) => category.id === categoryId);
    return Number(categoryRadiusOverrides.get(categoryId) ?? configured?.defaultRadiusM ?? 0);
  }

  function categoryIsLoaded(categoryId) {
    const radiusM = effectiveCategoryRadiusMeters(categoryId);
    return categoryRadiusIsLoaded(loadedCategoryRadii.get(categoryId), radiusM);
  }

  async function fetchOsmCandidates(categories, section, config, signal) {
    const maxEnvelope = Math.max(...categories.map((category) => category.radiusM + getGraceMeters(category, config)));
    const bbox = getRouteBounds({ segments: [section.points] }, maxEnvelope);
    const query = buildOverpassQuery(categories, bbox);
    const body = new URLSearchParams({ data: query });

    let response;
    try {
      if (isOffline()) throw new TypeError('Offline');
      response = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw Object.assign(new Error('Verbindung zum POI-Dienst fehlgeschlagen.', { cause: error }), { networkFailure: true });
    }

    if (!response.ok) {
      const error = new Error(`OpenStreetMap POI lookup failed (${response.status}).`);
      error.status = response.status;
      error.retryAfter = response.headers.get('Retry-After');
      throw error;
    }

    const payload = await response.json();
    if (!Array.isArray(payload.elements)) throw new Error('Invalid POI provider response.');
    const elements = payload.elements;
    Object.defineProperty(elements, 'poiIncomplete', { value: Boolean(payload.remark) });
    Object.defineProperty(elements, 'poiProvider', {
      value: response.headers.get('X-Bonkproof-Poi-Provider') || 'overpass',
      enumerable: false,
    });
    return elements;
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
      routeMeters: projection.routeMeters,
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
    return poiPassIndex.get(physicalId) || [];
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
    if (!acceptedScopedPois.has(poiKey(target)) && !activeCategoryIds.has(target.category.id)) {
      activeCategoryIds.add(target.category.id);
      projectWorkspace.changed();
    }
    const visiblePois = currentPois
      .filter((candidate) => isPoiVisible(candidate))
      .sort((a, b) => a.routeKm - b.routeKm || a.offRouteM - b.offRouteM);
    const targetIndex = visiblePois.findIndex((candidate) => poiKey(candidate) === poiKey(target));
    if (targetIndex >= 0) poiPage = Math.floor(targetIndex / POI_LIST_PAGE_SIZE) + 1;
    renderCategoryControls(poiConfig);
    renderPois(currentPois, currentCategories);
    const targetId = poiKey(target);
    const targetItem = [...poiList.querySelectorAll('.poi-list-item')]
      .find((item) => item.dataset.poiId === targetId);
    if (targetItem) poiList.closest('details').open = true;
    targetItem?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusPoi(target);
  }

  function toggleSelection(poiId) {
    selectedPoiIds = togglePoiSelection(selectedPoiIds, poiId);
    projectWorkspace.changed();
    renderPois(currentPois, currentCategories);
    renderRoutebook();
    renderWarnings();
    renderExportPanel();
  }

  function togglePin(poi) {
    const poiId = poiKey(poi);
    if (pinnedPoiIds.has(poiId)) {
      pinnedPoiIds.delete(poiId);
      pinnedPoiSnapshots.delete(poiId);
      if (poi.status === 'pinned') {
        currentPois = currentPois.flatMap((candidate) => poiKey(candidate) !== poiId ? [candidate]
          : selectedPoiIds.has(poiId) ? [{ ...candidate, status: 'retained' }] : []);
      }
    } else {
      pinnedPoiIds.add(poiId);
      pinnedPoiSnapshots.set(poiId, { ...poi });
    }
    renderPois(currentPois, currentCategories);
    renderRoutebook();
    renderWarnings();
    renderExportPanel();
    projectWorkspace.changed();
  }

  function renderRoutebook() {
    const routebook = buildRoutebook(currentPois, selectedPoiIds, currentRouteDistanceMeters, gapSettings);
    const hasRoute = currentRouteDistanceMeters > 0;
    const hasStops = routebook.stops.length > 0;
    const counts = { info: 0, warning: 0, critical: 0 };
    for (const entry of routebook.entries) {
      if (entry.gapSeverity) counts[entry.gapSeverity] += 1;
    }
    routebookWarningOverview.textContent = hasRoute
      ? ` · ${counts.info} Info, ${counts.warning} Warning, ${counts.critical} Critical`
      : '';
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
    const showExport = tab === 'export';
    poisTab.classList.toggle('is-active', showPois);
    poisTab.setAttribute('aria-selected', String(showPois));
    routebookTab.classList.toggle('is-active', showRoutebook);
    routebookTab.setAttribute('aria-selected', String(showRoutebook));
    exportTab.classList.toggle('is-active', showExport);
    exportTab.setAttribute('aria-selected', String(showExport));
    poiPanel.hidden = !showPois;
    routebookPanel.hidden = !showRoutebook;
    exportPanel.hidden = !showExport;
    renderMapPois();
    renderWarnings();
    if (showRoutebook) renderRoutebook();
    if (showExport) renderExportPanel();
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
    const statusText = poi.status === 'near-miss' ? 'Near miss' : (poi.status === 'pinned' ? 'Behalten aus vorheriger Suche' : (poi.status === 'retained' ? 'Ausgewählt aus vorheriger Suche' : 'Inside corridor'));
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
      const selectorId = CSS.escape(poiId);
      const selectionButton = map.getContainer().querySelector(`[data-poi-id="${selectorId}"]`);
      selectionButton?.addEventListener('click', () => toggleSelection(poiId), { once: true });
      const pinButton = map.getContainer().querySelector(`[data-pin-id="${selectorId}"]`);
      pinButton?.addEventListener('click', () => togglePin(poi), { once: true });
      const passButton = map.getContainer().querySelector(`[data-pass-jump="${selectorId}"]`);
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
    return foundResupplyPois(currentPois, acceptedScopedPois.values(), activeCategoryIds, categoryRadiusMeters, resupplyProfile, poiKey);
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
      poiWarningOverview.textContent = '';
      poiWarningSummary.hidden = true;
      poiWarningList.hidden = true;
      renderWarningLayer();
      return;
    }
    if (activeTab !== 'routebook' && poiSearchRunning) {
      poiWarningSummary.hidden = false;
      if (poiWarningOverview.textContent !== ' · Prüfung läuft') poiWarningOverview.textContent = ' · Prüfung läuft';
      poiWarningSummary.className = 'warning-summary is-pending';
      poiWarningSummary.textContent = 'Versorgungslücken werden geprüft …';
      poiWarningList.hidden = true;
      poiWarningList.innerHTML = '';
      renderWarningLayer();
      return;
    }
    if (activeTab !== 'routebook' && poiSectionStatus.started && (poiSectionStatus.failed.size > 0 || poiSectionStatus.completed < poiSectionStatus.total)) {
      poiWarningSummary.hidden = false;
      poiWarningOverview.textContent = ' · Prüfung unvollständig';
      poiWarningSummary.className = 'warning-summary is-incomplete';
      poiWarningSummary.textContent = `Prüfung unvollständig – ${failedPoiSections.length ? `${failedPoiSections.length} Suchpaket${failedPoiSections.length === 1 ? '' : 'e'} mit fehlgeschlagenen oder unvollständigen Antworten.` : 'Der gespeicherte Suchstand ist unvollständig. Eine neue Gesamtsuche kann ihn aktualisieren.'}`;
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
    const overview = ` · ${counts.info} Info, ${counts.warning} Warning, ${counts.critical} Critical`;
    if (poiWarningOverview.textContent !== overview) poiWarningOverview.textContent = overview;
    poiWarningSummary.className = 'warning-summary';
    poiWarningSummary.textContent = `${warnings.length} Versorgungslücke${warnings.length === 1 ? '' : 'n'} ab Info-Schwelle; ${counts.info} Info, ${counts.warning} Warning, ${counts.critical} Critical. Längster Abschnitt: ${formatDistance(longestGapM)}. Grundlage: ${foundCount} verlässliche Versorgungspunkte. Schwellen: ${formatThresholdKm(gapThresholds.infoM)} / ${formatThresholdKm(gapThresholds.warningM)} / ${formatThresholdKm(gapThresholds.criticalM)}. Near misses zählen nicht.`;
    poiWarningList.innerHTML = '';
    poiWarningList.hidden = warnings.length === 0;
    warnings.forEach((warning) => {
      const item = document.createElement('li');
      item.className = `warning-item severity-${warning.severity}`;
      item.innerHTML = `<span><strong>${warning.severity.toUpperCase()} · ${escapeHtml(warning.from)} → ${escapeHtml(warning.to)}</strong><small>${formatDistance(warning.lengthM)} ohne gefundenen POI</small></span><div class="warning-actions"><button class="warning-focus" type="button">Focus</button><button class="warning-focus scoped-poi-open" type="button">Hier nachsuchen</button></div>`;
      const searchButton = item.querySelector('.scoped-poi-open');
      searchButton.disabled = !poiConfig;
      searchButton.setAttribute('aria-label', `POIs nachsuchen von ${formatRouteKm(warning.startMeters)} bis ${formatRouteKm(warning.endMeters)}`);
      searchButton.addEventListener('click', () => openScopedSearch(warning));
      item.querySelector('button').addEventListener('click', () => {
        const geometry = extractRouteGeometryRange(currentParsedRoute, warning.startMeters, warning.endMeters);
        const points = geometry.flat();
        if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 13 });
      });
      poiWarningList.appendChild(item);
    });
    renderWarningLayer();
  }

  function setScopedSearchRunning(running) {
    scopedCategories.disabled = running;
    scopedSubmit.disabled = running || isOffline();
    scopedCancel.hidden = !running;
  }

  function resetScopedSearch() {
    scopedController?.abort();
    scopedController = null;
    scopedGap = null;
    acceptedScopedPois.clear();
    scopedConfigurations.clear();
    scopedCandidates.clear();
    scopedSearch.hidden = true;
    scopedReview.hidden = true;
    scopedResults.replaceChildren();
    scopedStatus.textContent = '';
    setScopedSearchRunning(false);
  }

  function openScopedSearch(warning) {
    const key = `${warning.startMeters}/${warning.endMeters}`;
    if (scopedGap?.key !== key) {
      scopedController?.abort();
      scopedController = null;
      setScopedSearchRunning(false);
      scopedGap = { key, startMeters: warning.startMeters, endMeters: warning.endMeters };
      scopedReview.hidden = true;
      scopedResults.replaceChildren();
      scopedCandidates.clear();
      scopedStatus.textContent = '';
      scopedRange.textContent = `${formatRouteKm(warning.startMeters)} bis ${formatRouteKm(warning.endMeters)}`;
      scopedCategories.querySelectorAll('.scoped-category').forEach((row) => row.remove());
      const saved = scopedConfigurations.get(key);
      for (const category of poiConfig.categories) {
        const row = document.createElement('div');
        row.className = 'scoped-category';
        const label = escapeHtml(category.label);
        const radius = saved?.radii.get(category.id) ?? categoryRadiusMeters(category.id);
        row.innerHTML = `
          <label><input type="checkbox" name="category" value="${escapeHtml(category.id)}" ${saved?.enabled.has(category.id) ? 'checked' : ''}> ${label}</label>
          <label><input type="number" aria-label="Suchradius für ${label} in Metern" min="50" max="20000" step="1" value="${radius}"> m</label>
        `;
        scopedCategories.appendChild(row);
      }
    }
    scopedSearch.hidden = false;
    scopedHeading.focus();
  }

  scopedForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!scopedGap || scopedController) return;
    if (isOffline()) {
      setPoiConnection('Nachsuche offline nicht verfügbar. Gespeicherte POIs bleiben verfügbar.');
      return;
    }
    setPoiConnection('');
    const enabled = new Set();
    const radii = new Map();
    for (const row of scopedCategories.querySelectorAll('.scoped-category')) {
      const checkbox = row.querySelector('input[type="checkbox"]');
      const radius = row.querySelector('input[type="number"]').valueAsNumber;
      if (checkbox.checked) {
        if (!Number.isFinite(radius)) {
          scopedStatus.textContent = 'Bitte für jede ausgewählte Kategorie einen Suchradius eingeben.';
          return;
        }
        enabled.add(checkbox.value);
      }
      if (Number.isFinite(radius)) radii.set(checkbox.value, radius);
    }
    if (!enabled.size) {
      scopedStatus.textContent = 'Bitte mindestens eine Kategorie auswählen.';
      return;
    }

    const { startMeters, endMeters, key } = scopedGap;
    scopedConfigurations.set(key, { enabled, radii });
    projectWorkspace.changed();
    const geometry = buildRouteGeometry(currentParsedRoute);
    const sections = buildScopedPoiQuerySections(currentParsedRoute, startMeters, endMeters, extractRouteGeometryRange);
    const categories = buildActiveCategories(poiConfig, enabled, radii);
    const controller = new AbortController();
    scopedController = controller;
    scopedCandidates.clear();
    scopedResults.replaceChildren();
    scopedReview.hidden = true;
    setScopedSearchRunning(true);
    scopedCancel.focus();

    let scopedNetworkFailures = 0;
    const { successful, failed, incomplete, aborted } = await searchScopedPoiWorkloads(
      createPoiQueryWorkloads(sections, categories),
      async (requested, section, signal) => {
        try {
          return await fetchOsmCandidates(requested, section, poiConfig, signal);
        } catch (error) {
          if (error?.networkFailure) scopedNetworkFailures += 1;
          throw error;
        }
      },
      (elements, requested) => {
        for (const element of elements) {
          for (const poi of normalizePoiPassBys(element, requested, geometry, poiConfig)) {
            if (poi.routeMeters < startMeters - 0.001 || poi.routeMeters > endMeters + 0.001) continue;
            const id = poiKey(poi);
            const previous = scopedCandidates.get(id);
            if (!previous || previous.status !== 'match' && poi.status === 'match') scopedCandidates.set(id, poi);
          }
        }
      },
      {
        signal: controller.signal,
        onProgress: (index, total) => { scopedStatus.textContent = `Suchpaket ${index} von ${total} läuft …`; },
      },
    );
    if (scopedController !== controller) return;
    scopedController = null;
    if (scopedNetworkFailures) setPoiConnection('Nachsuche: Verbindung zum POI-Dienst fehlgeschlagen.');
    else if (failed || incomplete) setPoiConnection('Nachsuche: POI-Dienst meldet einen Fehler oder unvollständige Daten.');
    const returnFocus = document.activeElement === scopedCancel;
    setScopedSearchRunning(false);
    if (returnFocus) scopedSubmit.focus();
    const results = [...scopedCandidates.values()].sort((a, b) => a.routeKm - b.routeKm);
    for (const poi of results) {
      const id = poiKey(poi);
      const row = document.createElement('li');
      const accepted = acceptedScopedPois.get(id);
      const known = accepted && (accepted.status === 'match' || poi.status !== 'match');
      row.innerHTML = `<label><input type="checkbox" name="pass" value="${escapeHtml(id)}" ${known ? 'disabled' : ''}>
        <strong>${escapeHtml(poi.name)}</strong> · ${escapeHtml(poi.category.label)} · ${formatRouteKm(poi.routeMeters)}
        · ${Math.round(poi.offRouteM)} m abseits${poi.status === 'near-miss' ? ' · Near miss' : ''}${known ? ' · bereits übernommen' : ''}</label>`;
      scopedResults.appendChild(row);
    }
    scopedReview.hidden = results.length === 0;
    const outcome = aborted ? 'Nachsuche abgebrochen.' : !sections.length ? 'Keine durchsuchbare Streckengeometrie.'
      : failed || incomplete ? (successful ? 'Nachsuche teilweise erfolgreich.' : 'Nachsuche fehlgeschlagen.') : 'Nachsuche abgeschlossen.';
    scopedStatus.textContent = `${outcome} ${successful} Suchpakete mit Antwort, ${failed} fehlgeschlagen, ${incomplete} mit unvollständiger Antwort. ${results.length} Vorbeifahrten zur Prüfung.`;
  });

  scopedCancel.addEventListener('click', () => scopedController?.abort());

  scopedReview.addEventListener('submit', (event) => {
    event.preventDefault();
    if (poiSearchRunning) return;
    const checked = [...scopedResults.querySelectorAll('input:checked:not(:disabled)')];
    if (!checked.length) {
      scopedStatus.textContent = 'Bitte mindestens eine Vorbeifahrt zur Übernahme auswählen.';
      return;
    }
    for (const input of checked) {
      acceptedScopedPois.set(input.value, { ...scopedCandidates.get(input.value), scoped: true, scopeKey: scopedGap.key });
      input.checked = false;
      input.disabled = true;
      input.parentElement.append(' · übernommen');
    }
    renderPois(currentPois, currentCategories);
    renderWarnings();
    renderRoutebook();
    renderExportPanel();
    projectWorkspace.changed();
    scopedStatus.textContent = `${checked.length} Vorbeifahrten in die POI-Liste übernommen. Dort kannst du sie als Stopps auswählen oder pinnen.`;
  });

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

  function isPoiVisible(poi, effectiveState = currentEffectivePoiState()) {
    if (pinnedPoiIds.has(poiKey(poi)) || selectedPoiIds.has(poiKey(poi))) return true;
    if (acceptedScopedPois.has(poiKey(poi))) return true;
    if (poi.status === 'retained' || poi.status === 'pinned') return false;
    if (!effectiveState.enabledIds.has(poi.category.id)) return false;
    const configured = poiConfig?.categories.find((category) => category.id === poi.category.id) || poi.category;
    const radiusM = effectiveState.radiusOverrides.get(poi.category.id) ?? configured.defaultRadiusM;
    return poiInsideEffectiveCorridor(poi, radiusM, getGraceMeters({ ...configured, radiusM }, poiConfig));
  }

  function renderMapPois() {
    poiLayer.clearLayers();
    poiMarkers.clear();
    if (activeTab === 'routebook' || activeTab === 'export') {
      currentPois.filter((poi) => selectedPoiIds.has(poiKey(poi))).forEach((poi) => renderPoiMarker(poi));
      return;
    }
    const effectiveState = currentEffectivePoiState();
    const mapPois = currentPois.filter((poi) => isPoiVisible(poi, effectiveState));
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
    pois = mergeScopedPoiResults(pois, acceptedScopedPois.values(), poiKey);
    poiPassIndex = buildPoiPassIndex(pois, physicalPoiKey);
    currentPois = pois;
    currentCategories = categories;
    const effectiveState = currentEffectivePoiState();
    const visiblePois = pois
      .filter((poi) => isPoiVisible(poi, effectiveState))
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
      const active = effectiveState.enabledIds.has(row.dataset.category);
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
            <span class="poi-list-main"><strong>${escapeHtml(poi.name)}</strong><small>${escapeHtml(poi.category.label)} · ${Math.round(poi.offRouteM)} m off route${passText}${acceptedScopedPois.has(poiId) ? ' · Nachsuche' : ''}</small></span>
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

  async function loadPois(parsed, preserveSelection = false, retryFailedOnly = false, requestedCategoryIds = null, replaceCategoryIds = null) {
    if (isOffline()) {
      setPoiConnection('Externe POI-Suche offline nicht verfügbar. Der lokale Planungsstand bleibt erhalten.');
      return;
    }
    if (poiSearchRunning) {
      requestedCategoryIds?.forEach((id) => pendingCategoryIds.add(id));
      return;
    }
    const previousSelection = preserveSelection ? new Set(selectedPoiIds) : new Set();
    const previousPins = preserveSelection ? new Set(pinnedPoiIds) : new Set();
    const previousPinnedSnapshots = preserveSelection
      ? new Map(currentPois.filter((poi) => previousPins.has(poiKey(poi))).map((poi) => [poiKey(poi), { ...poi }]))
      : new Map();
    const previousPois = currentPois;
    const previousSectionStatus = poiSectionStatus;
    setPoiConnection('');
    setPoiSearchRunning(true);
    poiAbortController?.abort();
    poiAbortController = new AbortController();
    const { signal } = poiAbortController;
    const incremental = Array.isArray(requestedCategoryIds) && requestedCategoryIds.length > 0;
    let planningChanged = false;
    selectedPoiIds = previousSelection;
    pinnedPoiIds = previousPins;
    pinnedPoiSnapshots = previousPinnedSnapshots;
    setPoiStatus('Reading POI configuration…');

    try {
      const [config] = await Promise.all([getPoiConfig(), getResupplyProfile()]);
      if (signal.aborted) return;

      const effectiveState = currentEffectivePoiState();
      const queryCategoryIds = incremental ? new Set(requestedCategoryIds) : effectiveState.enabledIds;
      const categories = buildActiveCategories(config, queryCategoryIds, effectiveState.radiusOverrides);
      poiCategories.hidden = false;
      if (categories.length === 0) {
        loadedCategoryRadii.clear();
        failedPoiSections = [];
        poiSectionStatus = { total: 0, completed: 0, failed: new Set(), started: true };
        renderPois(preservePoiSelections([], previousPois, selectedPoiIds, pinnedPoiIds, poiKey), config.categories);
        renderRoutebook();
        planningChanged = true;
        return;
      }

      const geometry = buildRouteGeometry(parsed);
      const replacedIds = new Set(replaceCategoryIds || []);
      const previousUnrelatedFailures = incremental
        ? failedPoiSections.map((workload) => ({
          ...workload,
          categories: workload.categories.filter((category) => !queryCategoryIds.has(category.id)),
        })).filter((workload) => workload.categories.length > 0)
        : [];
      const deduped = new Map((retryFailedOnly || incremental ? currentPois : []).map((poi) => [poiKey(poi), poi]));
      const freshQueriedPois = new Map();
      const workloads = retryFailedOnly
        ? failedPoiSections.map((workload) => ({
          ...workload,
          categories: workload.categories.filter((category) => effectiveState.enabledIds.has(category.id)),
        })).filter((workload) => workload.categories.length > 0)
        : createPoiQueryWorkloads(currentPoiSections.length ? currentPoiSections
          : (currentPoiSections = buildPoiQuerySections(parsed)), categories);
      const failedWorkloads = [];
      let incompleteWorkloadCount = 0;
      let networkFailures = 0;
      poiSectionStatus = { total: workloads.length, completed: 0, failed: new Set(), started: true };

      for (let workloadPosition = 0; workloadPosition < workloads.length; workloadPosition += 1) {
        const workload = workloads[workloadPosition];
        const section = workload.section;
        const workloadCategories = workload.categories;
        let paceAfterWorkload = true;
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
          if (signal.aborted || !candidates) return;
          paceAfterWorkload = candidates.poiProvider !== 'overture-local';
          candidates.forEach((element) => {
            normalizePoiPassBys(element, workloadCategories, geometry, config).forEach((poi) => {
              const key = poiKey(poi);
              const freshExisting = freshQueriedPois.get(key);
              if (!freshExisting || poi.offRouteM < freshExisting.offRouteM) freshQueriedPois.set(key, poi);
              const existing = deduped.get(key);
              if (incremental || !existing || existing.status === 'pinned' || existing.status === 'retained' || poi.offRouteM < existing.offRouteM) {
                deduped.set(key, poi);
                if (pinnedPoiIds.has(key)) pinnedPoiSnapshots.set(key, { ...poi });
              }
            });
          });
          poiSectionStatus.completed += 1;
          if (candidates.poiIncomplete) {
            failedWorkloads.push(workload);
            incompleteWorkloadCount += 1;
            poiSectionStatus.failed.add(workload.id);
          } else {
            poiSectionStatus.failed.delete(workload.id);
          }
        } catch (error) {
          if (signal.aborted) return;
          if (error?.networkFailure) {
            networkFailures += 1;
            if (isOffline()) paceAfterWorkload = false;
          }
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
        if (paceAfterWorkload && workloadPosition < workloads.length - 1) await waitForPoiBackoff(1000, section, signal);
      }

      if (signal.aborted) return;
      if (networkFailures) {
        setPoiConnection('Verbindung zum POI-Dienst fehlgeschlagen. Vorhandene POIs bleiben erhalten.');
      } else if (failedWorkloads.length) {
        setPoiConnection('POI-Dienst meldet einen Fehler oder unvollständige Daten. Vorhandene POIs bleiben erhalten.');
      }
      if (failedWorkloads.length && failedWorkloads.length === poiSectionStatus.completed
          && !freshQueriedPois.size && preserveSelection && previousSectionStatus.started) {
        poiSectionStatus = previousSectionStatus;
        setPoiStatus('Keine neuen Suchdaten. Der lokale Planungsstand bleibt erhalten.');
        return;
      }
      let finalPois = deduped;
      if (failedWorkloads.length) {
        for (const poi of previousPois) {
          const key = poiKey(poi);
          if (!finalPois.has(key)) finalPois.set(key, poi);
        }
      } else if (!retryFailedOnly && !incremental) loadedCategoryRadii.clear();
      if (incremental && replacedIds.size > 0 && failedWorkloads.length === 0) {
        finalPois = new Map(currentPois
          .filter((poi) => !replacedIds.has(poi.category.id))
          .map((poi) => [poiKey(poi), poi]));
        freshQueriedPois.forEach((poi, id) => finalPois.set(id, poi));
      }
      const preserved = preservePoiSelections(finalPois.values(),
        [...pinnedPoiSnapshots.values(), ...currentPois, ...previousPois], selectedPoiIds, pinnedPoiIds, poiKey);
      const pois = mergeScopedPoiResults(preserved, acceptedScopedPois.values(), poiKey).sort((a, b) => a.routeKm - b.routeKm || a.offRouteM - b.offRouteM);
      selectedPoiIds = new Set([...selectedPoiIds].filter((id) => pois.some((poi) => poiKey(poi) === id)));
      pinnedPoiIds = new Set([...pinnedPoiIds].filter((id) => pois.some((poi) => poiKey(poi) === id)));
      failedPoiSections = incremental ? [...previousUnrelatedFailures, ...failedWorkloads] : failedWorkloads;
      poiSectionStatus.failed = new Set(failedPoiSections);
      const searchedRadii = new Map();
      for (const workload of workloads) {
        for (const category of workload.categories) {
          searchedRadii.set(category.id, Math.min(searchedRadii.get(category.id) ?? Infinity, category.radiusM));
        }
      }
      const incompleteCategories = new Set(failedPoiSections.flatMap((workload) => workload.categories.map(({ id }) => id)));
      for (const [id, radius] of searchedRadii) {
        if (!incompleteCategories.has(id)) loadedCategoryRadii.set(id, radius);
      }
      renderPois(pois, config.categories);
      planningChanged = true;
      renderRoutebook();
      renderExportPanel();
      setPoiStatus(
        failedPoiSections.length > 0
          ? `POI-Suche teilweise erfolgreich: ${failedPoiSections.length} Suchpaket${failedPoiSections.length === 1 ? '' : 'e'} fehlgeschlagen oder unvollständig (${incompleteWorkloadCount} unvollständige Antworten in dieser Suche). ${pois.length} POIs verfügbar.`
          : `${pois.length} POIs vollständig geladen (${poiSectionStatus.completed} Suchpakete verarbeitet).`,
      );
    } catch (error) {
      if (signal.aborted) return;
      poiSectionStatus = previousSectionStatus;
      console.error(error);
      setPoiStatus('The route is loaded, but the POI lookup failed. You can keep using the route view and try again with another GPX later.');
      showError(error instanceof Error ? error.message : 'Could not load route POIs.');
    } finally {
      if (!signal.aborted) {
        setPoiSearchRunning(false);
        if (planningChanged) projectWorkspace.changed();
        const { enabledIds } = currentEffectivePoiState();
        const pending = [...pendingCategoryIds].filter((id) => enabledIds.has(id) && !categoryIsLoaded(id));
        pendingCategoryIds.clear();
        if (pending.length) void loadPois(parsed, true, false, pending, pending);
      }
    }
  }

  async function loadFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.gpx')) {
      showError('Please choose a .gpx file.');
      return;
    }

    const request = ++routeLoadRequest;
    routeFileReading = true;
    try {
      if (file.size > PROJECT_FILE_MAX_BYTES) throw new Error('Die GPX-Datei überschreitet 128 MiB.');
      const text = await file.text();
      if (request !== routeLoadRequest) return;
      if (text.length > PROJECT_GPX_MAX_CHARS) throw new Error('Der GPX-Text überschreitet das Projektlimit.');
      const parsed = parseGpx(text);
      renderRoute(parsed, file.name, text);
      projectWorkspace.changed();
      await loadPois(parsed);
    } catch (error) {
      if (request !== routeLoadRequest) return;
      console.error(error);
      showError(error instanceof Error ? error.message : 'Could not read this GPX file.');
    } finally {
      if (request === routeLoadRequest) routeFileReading = false;
    }
  }

  fileInput.addEventListener('change', (event) => loadFile(event.target.files?.[0]));
  replaceRoute.addEventListener('click', () => fileInput.click());
  reloadPois.addEventListener('click', () => currentParsedRoute && loadPois(currentParsedRoute, true, failedPoiSections.length > 0));
  gapSettingInputs.forEach((input) => input.addEventListener('input', applyGapSettingsFromInputs));
  iceToggle.addEventListener('click', () => {
    const preset = poiConfig?.presets?.ice;
    if (!preset || poiSearchRunning) return;
    iceActive = !iceActive;
    poiPage = 1;
    renderIceControl();
    renderCategoryControls(poiConfig);
    if (!currentParsedRoute) {
      renderPois(currentPois, currentCategories);
      return;
    }
    if (!iceActive) {
      renderPois(currentPois, currentCategories);
      renderWarnings();
      renderWarningLayer();
      return;
    }
    const effectiveState = currentEffectivePoiState();
    const affected = Object.keys(preset.radiusOverridesM || {})
      .filter((categoryId) => effectiveState.enabledIds.has(categoryId) && !categoryIsLoaded(categoryId));
    if (affected.length > 0) loadPois(currentParsedRoute, true, false, affected, affected);
    else renderPois(currentPois, currentCategories);
  });
  poiCategories.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category-toggle]');
    if (!button) return;
    const categoryId = button.dataset.categoryToggle;
    const enabling = !activeCategoryIds.has(categoryId);
    if (enabling) activeCategoryIds.add(categoryId);
    else activeCategoryIds.delete(categoryId);
    projectWorkspace.changed();
    poiPage = 1;
    if (poiConfig) renderCategoryControls(poiConfig);
    if (enabling && currentParsedRoute && !categoryIsLoaded(categoryId)) {
      loadPois(currentParsedRoute, true, false, [categoryId], [categoryId]);
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
    const previousRadiusM = categoryRadiusMeters(categoryId);
    const radiusM = Number(input.value);
    if (!Number.isFinite(radiusM) || radiusM <= 0) {
      input.value = String(fallback);
      return;
    }
    categoryRadiusOverrides.set(categoryId, radiusM);
    if (radiusM === previousRadiusM) return;
    projectWorkspace.changed();
    const effectiveState = currentEffectivePoiState();
    if (effectiveState.enabledIds.has(categoryId) && currentParsedRoute && !categoryIsLoaded(categoryId)) {
      loadPois(currentParsedRoute, true, false, [categoryId], [categoryId]);
    } else {
      poiPage = 1;
      if (poiConfig) renderCategoryControls(poiConfig);
      renderPois(currentPois, currentCategories);
      renderWarnings();
      renderWarningLayer();
    }
  });
  poiPrevious.addEventListener('click', () => {
    poiPage -= 1;
    renderPois(currentPois, currentCategories);
  });
  poiNext.addEventListener('click', () => {
    poiPage += 1;
    renderPois(currentPois, currentCategories);
  });
  document.getElementById('warnings-shortcut').addEventListener('click', () => {
    setActiveTab('pois');
    const details = poiWarningList.closest('details');
    details.open = true;
    details.querySelector('summary').focus();
    details.scrollIntoView({ block: 'nearest' });
  });
  poisTab.addEventListener('click', () => setActiveTab('pois'));
  routebookTab.addEventListener('click', () => setActiveTab('routebook'));
  exportTab.addEventListener('click', () => {
    if (!exportTab.disabled) setActiveTab('export');
  });
  exportTarget.addEventListener('change', renderExportPanel);
  exportFormat.addEventListener('change', renderExportPanel);
  exportGapWarnings.addEventListener('change', renderExportPanel);
  for (const input of [exportTarget, exportFormat, exportGapWarnings]) {
    input.addEventListener('change', () => projectWorkspace.changed());
  }
  exportDownload.addEventListener('click', () => {
    try {
      downloadCurrentRouteExport(exportFormat.value);
    } catch (error) {
      console.error(error);
      showError(error instanceof Error ? error.message : 'Could not export this route.');
    }
  });
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
    if (event.key === 'Escape' && !routeCard.hidden && !event.defaultPrevented
        && !event.target.closest?.('#project-workspace')) {
      if (projectWorkspace.isStored() && !window.confirm('Die Route aus dem gespeicherten Projekt entfernen?')) return;
      clearRoute();
      projectWorkspace.changed();
    }
  });

  function captureProjectState() {
    const incomplete = poiSectionStatus.failed.size > 0 || poiSectionStatus.completed < poiSectionStatus.total;
    return {
      projectionVersion: 1,
      route: currentParsedRoute ? { fileName: currentRouteFileName, gpx: currentSourceGpxText } : null,
      global: {
        enabled: [...activeCategoryIds],
        radii: [...categoryRadiusOverrides],
        loadedRadii: [...loadedCategoryRadii],
        coverage: poiSectionStatus.started ? (incomplete ? 'incomplete' : 'complete') : 'unsearched',
      },
      scopes: [...scopedConfigurations].map(([key, { enabled, radii }]) => {
        const [start, end] = key.split('/').map(Number);
        return { start, end, enabled: [...enabled], radii: [...radii] };
      }),
      pois: currentPois.map(snapshotProjectPoi),
      accepted: [...acceptedScopedPois.values()].map(snapshotProjectPoi),
      selected: [...selectedPoiIds],
      pins: [...pinnedPoiIds],
      gaps: { ...gapSettings },
      resupply: [...(resupplyProfile?.reliableCategoryIds ?? [])],
      exportOptions: { target: exportTarget.value || 'generic', format: exportFormat.value || 'gpx', gaps: exportGapWarnings.checked },
    };
  }

  async function prepareProject(project) {
    const prepared = validateProject(project, parseGpx);
    await Promise.all([getPoiConfig(), getResupplyProfile()]);
    return prepared;
  }

  function applyProject(prepared) {
    routeLoadRequest += 1;
    routeFileReading = false;
    setPoiConnection('');
    const state = prepared?.project.state;
    if (prepared?.parsedRoute) {
      renderRoute(prepared.parsedRoute, state.route.fileName, state.route.gpx);
    } else clearRoute();

    gapSettings = { ...(state?.gaps ?? DEFAULT_GAP_SETTINGS) };
    [gapCriticalKm.value, gapInfoPercent.value, gapWarningPercent.value, gapCriticalPercent.value] = [
      gapSettings.criticalDistanceKm, gapSettings.infoPercent, gapSettings.warningPercent, gapSettings.criticalPercent,
    ];
    gapSettingsError.hidden = true;
    gapSettingInputs.forEach((input) => input.removeAttribute('aria-invalid'));
    resupplyProfile = state ? { reliableCategoryIds: state.resupply } : defaultResupplyProfile;
    if (state) {
      activeCategoryIds = new Set(state.global.enabled);
      categoryRadiusOverrides = new Map(state.global.radii);
      loadedCategoryRadii = new Map(state.global.loadedRadii);
      selectedPoiIds = new Set(state.selected);
      pinnedPoiIds = new Set(state.pins);
      for (const scope of state.scopes) {
        scopedConfigurations.set(`${scope.start}/${scope.end}`, { enabled: new Set(scope.enabled), radii: new Map(scope.radii) });
      }
      const restorePoi = (poi) => ({ ...snapshotProjectPoi(poi), routeMeters: poi.routeKm * 1000 });
      for (const hit of state.accepted) acceptedScopedPois.set(poiKey(hit), restorePoi(hit));
      const pois = state.pois.map(restorePoi);
      pinnedPoiSnapshots = new Map([...pois, ...acceptedScopedPois.values()]
        .filter((poi) => pinnedPoiIds.has(poiKey(poi))).map((poi) => [poiKey(poi), poi]));
      poiSectionStatus = { total: 0, completed: 0, failed: new Set(state.global.coverage === 'incomplete' ? ['restored'] : []),
        started: state.global.coverage !== 'unsearched' };
      renderCategoryControls(poiConfig);
      if (prepared.parsedRoute) renderPois(pois, poiConfig.categories);
    }
    populateExportTargets();
    exportTarget.value = getExportProfile(state?.exportOptions.target).id;
    syncExportFormats(exportTarget.value);
    if (availableExportFormats(exportTarget.value).includes(state?.exportOptions.format)) exportFormat.value = state.exportOptions.format;
    exportGapWarnings.checked = state?.exportOptions.gaps ?? false;
    renderGapSettingsPreview();
    renderRoutebook();
    setActiveTab('pois');
    setPoiSearchRunning(false);
    renderExportPanel();
    if (prepared?.parsedRoute) setPoiStatus('Lokaler Planungsstand geladen. POIs können bei Bedarf neu gesucht werden.');
  }

  projectWorkspace = mountProjectWorkspace(document.getElementById('project-workspace'), {
    store: createProjectStore(),
    capture: captureProjectState,
    verify: (project) => validateProject(project, () => currentParsedRoute),
    prepare: prepareProject,
    apply: applyProject,
    canCapture: () => Boolean(poiConfig && resupplyProfile) && !poiSearchRunning,
    download: (project) => {
      const content = JSON.stringify(project);
      if (new Blob([content]).size > PROJECT_FILE_MAX_BYTES) throw new Error('Die Projektdatei überschreitet 128 MiB.');
      downloadExportFile({ filename: `${sanitizeExportBaseName(project.name)}.bonkproof.json`, mimeType: 'application/json', content });
    },
  });

  function initializePlanningSettings() {
    if (poiConfig && resupplyProfile) return;
    void Promise.all([getPoiConfig(), getResupplyProfile()]).then(() => projectWorkspace.availabilityChanged()).catch((error) => {
      console.error(error);
      showError(error instanceof Error ? error.message : 'Bonkproof konnte die Planungseinstellungen nicht laden.');
    });
  }

  window.addEventListener('online', () => {
    renderConnectivity();
    initializePlanningSettings();
  });
  navigator.serviceWorker?.addEventListener('controllerchange', initializePlanningSettings);
  window.addEventListener('offline', renderConnectivity);
  renderConnectivity();
  mountPwa({ canUpdate: () => projectWorkspace.safeToReload() && !poiSearchRunning && !scopedController && !routeFileReading });
  renderGapSettingsPreview();
  initializePlanningSettings();
})();
