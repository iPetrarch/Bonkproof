(() => {
  const CONFIG_URL = './config/poi-categories.json';
  const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
  const INITIAL_CATEGORY_IDS = ['supermarket', 'fuel'];

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
  const supermarketCount = document.getElementById('supermarket-count');
  const fuelCount = document.getElementById('fuel-count');
  const supermarketRadius = document.getElementById('supermarket-radius');
  const fuelRadius = document.getElementById('fuel-radius');

  const map = L.map('map', {
    zoomControl: true,
    preferCanvas: true,
  }).setView([52.5, 9.0], 6);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const routeLayer = L.featureGroup().addTo(map);
  const poiLayer = L.featureGroup().addTo(map);

  let errorTimer = null;
  let poiConfigPromise = null;
  let poiAbortController = null;

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

  function clearPoiUi() {
    poiLayer.clearLayers();
    poiCategories.hidden = true;
    poiLegend.hidden = true;
    poiList.hidden = true;
    poiList.innerHTML = '';
    poiTotal.hidden = true;
    poiTotal.textContent = '0';
    supermarketCount.textContent = '0';
    fuelCount.textContent = '0';
    supermarketRadius.textContent = '—';
    fuelRadius.textContent = '—';
  }

  function clearRoute() {
    poiAbortController?.abort();
    routeLayer.clearLayers();
    clearPoiUi();
    routeCard.hidden = true;
    dropZone.hidden = false;
    fileInput.value = '';
    setPoiStatus('Load a GPX route. Bonkproof will then look for supermarkets and fuel stations near the route.');
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

  function markerIcon(kind) {
    return L.divIcon({
      className: '',
      html: `<div class="route-marker ${kind === 'finish' ? 'finish' : ''}" aria-hidden="true"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }

  function poiMarkerIcon(poi) {
    const label = poi.category.id === 'fuel' ? 'F' : 'S';
    return L.divIcon({
      className: '',
      html: `<div class="poi-marker ${poi.status === 'near-miss' ? 'near-miss' : ''} ${poi.category.id}" aria-hidden="true">${label}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -14],
    });
  }

  function renderRoute(parsed, fileName) {
    routeLayer.clearLayers();
    poiLayer.clearLayers();

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
  }

  async function getPoiConfig() {
    if (!poiConfigPromise) {
      poiConfigPromise = fetch(CONFIG_URL, { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Could not load POI configuration (${response.status}).`);
        }
        return response.json();
      });
    }
    return poiConfigPromise;
  }

  function getGraceMeters(category, config) {
    const softEdge = config.corridor?.softEdge;
    if (!softEdge?.enabled) {
      return 0;
    }
    return Math.min(
      Number(softEdge.maximumGraceM) || Infinity,
      Math.max(Number(softEdge.minimumGraceM) || 0, category.defaultRadiusM * (Number(softEdge.percentage) || 0)),
    );
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

  function escapeOverpass(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function categoryQueryStatements(category, bbox) {
    const matches = category.osm?.anyOf || [];
    return matches.flatMap((match) => Object.entries(match).map(([key, value]) => (
      `nwr["${escapeOverpass(key)}"="${escapeOverpass(value)}"](${bbox.join(',')});`
    )));
  }

  function buildOverpassQuery(categories, bbox) {
    const statements = categories.flatMap((category) => categoryQueryStatements(category, bbox));
    return `[out:json][timeout:30];(${statements.join('')});out center tags;`;
  }

  async function fetchOsmCandidates(categories, parsed, config, signal) {
    const maxEnvelope = Math.max(...categories.map((category) => category.defaultRadiusM + getGraceMeters(category, config)));
    const bbox = getRouteBounds(parsed, maxEnvelope);
    const query = buildOverpassQuery(categories, bbox);
    const body = new URLSearchParams({ data: query });

    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body,
      signal,
    });

    if (!response.ok) {
      throw new Error(`OpenStreetMap POI lookup failed (${response.status}).`);
    }

    const payload = await response.json();
    return Array.isArray(payload.elements) ? payload.elements : [];
  }

  function elementCoordinate(element) {
    const lat = Number(element.lat ?? element.center?.lat);
    const lon = Number(element.lon ?? element.center?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  }

  function tagsMatch(tags, matcher) {
    return Object.entries(matcher).every(([key, value]) => tags?.[key] === value);
  }

  function matchingCategory(element, categories) {
    return categories.find((category) => (category.osm?.anyOf || []).some((matcher) => tagsMatch(element.tags, matcher))) || null;
  }

  function buildRouteGeometry(parsed) {
    let routeOffset = 0;
    const lineSegments = [];

    parsed.segments.forEach((segment) => {
      let segmentOffset = 0;
      for (let i = 1; i < segment.length; i += 1) {
        const a = segment[i - 1];
        const b = segment[i];
        const length = haversineMeters(a, b);
        lineSegments.push({ a, b, length, routeStartM: routeOffset + segmentOffset });
        segmentOffset += length;
      }
      routeOffset += segmentOffset;
    });

    return lineSegments;
  }

  function nearestRouteProjection(point, geometry) {
    let best = null;

    geometry.forEach((segment) => {
      const referenceLat = (segment.a.lat + segment.b.lat + point.lat) / 3;
      const metersPerLon = 111320 * Math.max(0.2, Math.cos(toRad(referenceLat)));
      const metersPerLat = 111320;
      const bx = (segment.b.lon - segment.a.lon) * metersPerLon;
      const by = (segment.b.lat - segment.a.lat) * metersPerLat;
      const px = (point.lon - segment.a.lon) * metersPerLon;
      const py = (point.lat - segment.a.lat) * metersPerLat;
      const denom = bx * bx + by * by;
      const t = denom > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / denom)) : 0;
      const dx = px - bx * t;
      const dy = py - by * t;
      const distanceM = Math.hypot(dx, dy);

      if (!best || distanceM < best.distanceM) {
        best = {
          distanceM,
          routeKm: (segment.routeStartM + segment.length * t) / 1000,
        };
      }
    });

    return best;
  }

  function normalizePoi(element, categories, geometry, config) {
    const coordinate = elementCoordinate(element);
    const category = matchingCategory(element, categories);
    if (!coordinate || !category) {
      return null;
    }

    const projection = nearestRouteProjection(coordinate, geometry);
    if (!projection) {
      return null;
    }

    const graceM = getGraceMeters(category, config);
    const hardLimitM = category.defaultRadiusM;
    const softLimitM = hardLimitM + graceM;
    if (projection.distanceM > softLimitM) {
      return null;
    }

    return {
      osmType: element.type,
      osmId: element.id,
      lat: coordinate.lat,
      lon: coordinate.lon,
      tags: element.tags || {},
      category,
      routeKm: projection.routeKm,
      offRouteM: projection.distanceM,
      status: projection.distanceM <= hardLimitM ? 'match' : 'near-miss',
      name: element.tags?.name || element.tags?.brand || category.label,
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderPois(pois, categories) {
    poiLayer.clearLayers();

    pois.forEach((poi) => {
      const statusText = poi.status === 'near-miss' ? 'Near miss' : 'Inside corridor';
      const popup = `
        <strong>${escapeHtml(poi.name)}</strong><br>
        ${escapeHtml(poi.category.label)} · km ${poi.routeKm.toFixed(1)}<br>
        ${Math.round(poi.offRouteM)} m off route · ${statusText}
      `;
      L.marker([poi.lat, poi.lon], { icon: poiMarkerIcon(poi), title: poi.name })
        .bindPopup(popup)
        .addTo(poiLayer);
    });

    const counts = Object.fromEntries(categories.map((category) => [category.id, 0]));
    pois.forEach((poi) => { counts[poi.category.id] = (counts[poi.category.id] || 0) + 1; });

    supermarketCount.textContent = counts.supermarket || 0;
    fuelCount.textContent = counts.fuel || 0;
    poiTotal.textContent = String(pois.length);
    poiTotal.hidden = false;
    poiCategories.hidden = false;
    poiLegend.hidden = false;

    poiList.innerHTML = '';
    pois.slice(0, 30).forEach((poi) => {
      const item = document.createElement('li');
      item.className = `poi-list-item ${poi.status === 'near-miss' ? 'near-miss' : ''}`;
      item.innerHTML = `
        <button type="button" class="poi-list-button">
          <span class="poi-list-main"><strong>${escapeHtml(poi.name)}</strong><small>${escapeHtml(poi.category.label)} · ${Math.round(poi.offRouteM)} m off route</small></span>
          <span class="route-km">km ${poi.routeKm.toFixed(1)}</span>
        </button>
      `;
      item.querySelector('button').addEventListener('click', () => {
        map.setView([poi.lat, poi.lon], Math.max(map.getZoom(), 15));
        const matchingMarker = poiLayer.getLayers().find((layer) => layer.getLatLng && layer.getLatLng().lat === poi.lat && layer.getLatLng().lng === poi.lon);
        matchingMarker?.openPopup();
      });
      poiList.appendChild(item);
    });
    poiList.hidden = pois.length === 0;

    const nearMissCount = pois.filter((poi) => poi.status === 'near-miss').length;
    setPoiStatus(
      pois.length === 0
        ? 'No supermarkets or fuel stations were found inside the current route corridors.'
        : `${pois.length} useful stop${pois.length === 1 ? '' : 's'} found in route order${nearMissCount ? `, including ${nearMissCount} near miss${nearMissCount === 1 ? '' : 'es'}` : ''}.`,
    );
  }

  async function loadPois(parsed) {
    poiAbortController?.abort();
    poiAbortController = new AbortController();
    const { signal } = poiAbortController;
    clearPoiUi();
    setPoiStatus('Reading POI configuration…');

    try {
      const config = await getPoiConfig();
      if (signal.aborted) return;

      const categories = config.categories.filter((category) => INITIAL_CATEGORY_IDS.includes(category.id));
      if (categories.length !== INITIAL_CATEGORY_IDS.length) {
        throw new Error('The POI configuration is missing supermarket or fuel categories.');
      }

      categories.forEach((category) => {
        const grace = getGraceMeters(category, config);
        const text = `${category.defaultRadiusM} m + ${grace} m soft edge`;
        if (category.id === 'supermarket') supermarketRadius.textContent = text;
        if (category.id === 'fuel') fuelRadius.textContent = text;
      });
      poiCategories.hidden = false;
      setPoiStatus('Searching OpenStreetMap for supermarkets and fuel stations…');

      const candidates = await fetchOsmCandidates(categories, parsed, config, signal);
      if (signal.aborted) return;

      setPoiStatus(`Checking ${candidates.length.toLocaleString()} OpenStreetMap candidates against the actual route corridor…`);
      const geometry = buildRouteGeometry(parsed);
      const deduped = new Map();

      candidates.forEach((element) => {
        const poi = normalizePoi(element, categories, geometry, config);
        if (!poi) return;
        const key = `${poi.osmType}/${poi.osmId}`;
        const existing = deduped.get(key);
        if (!existing || poi.offRouteM < existing.offRouteM) {
          deduped.set(key, poi);
        }
      });

      const pois = Array.from(deduped.values()).sort((a, b) => a.routeKm - b.routeKm || a.offRouteM - b.offRouteM);
      renderPois(pois, categories);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error(error);
      setPoiStatus('The route is loaded, but the POI lookup failed. You can keep using the route view and try again with another GPX later.');
      showError(error instanceof Error ? error.message : 'Could not load route POIs.');
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
})();
