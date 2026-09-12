(() => {
  const fileInput = document.getElementById('gpx-file');
  const dropZone = document.getElementById('drop-zone');
  const routeCard = document.getElementById('route-card');
  const routeName = document.getElementById('route-name');
  const routeFile = document.getElementById('route-file');
  const routeDistance = document.getElementById('route-distance');
  const routePoints = document.getElementById('route-points');
  const replaceRoute = document.getElementById('replace-route');
  const errorMessage = document.getElementById('error-message');

  const map = L.map('map', {
    zoomControl: true,
    preferCanvas: true,
  }).setView([52.5, 9.0], 6);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const routeLayer = L.featureGroup().addTo(map);
  let errorTimer = null;

  function showError(message) {
    clearTimeout(errorTimer);
    errorMessage.textContent = message;
    errorMessage.hidden = false;
    errorTimer = setTimeout(() => {
      errorMessage.hidden = true;
    }, 6000);
  }

  function clearRoute() {
    routeLayer.clearLayers();
    routeCard.hidden = true;
    dropZone.hidden = false;
    fileInput.value = '';
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
      const routePoints = Array.from(documentXml.getElementsByTagNameNS('*', 'rtept')).map(parsePoint).filter(Boolean);
      if (routePoints.length > 0) {
        segments = [routePoints];
      }
    }

    if (segments.length === 0) {
      throw new Error('No track or route points were found in this GPX file.');
    }

    const metadataName = documentXml.getElementsByTagNameNS('*', 'metadata')[0]
      ?.getElementsByTagNameNS('*', 'name')[0]
      ?.textContent
      ?.trim();

    const trackName = documentXml.getElementsByTagNameNS('*', 'trk')[0]
      ?.getElementsByTagNameNS('*', 'name')[0]
      ?.textContent
      ?.trim();

    const rteName = documentXml.getElementsByTagNameNS('*', 'rte')[0]
      ?.getElementsByTagNameNS('*', 'name')[0]
      ?.textContent
      ?.trim();

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
    const km = meters / 1000;
    if (km < 10) {
      return `${km.toFixed(2)} km`;
    }
    return `${km.toFixed(1)} km`;
  }

  function markerIcon(kind) {
    return L.divIcon({
      className: '',
      html: `<div class="route-marker ${kind === 'finish' ? 'finish' : ''}" aria-hidden="true"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }

  function renderRoute(parsed, fileName) {
    routeLayer.clearLayers();

    parsed.segments.forEach((segment) => {
      L.polyline(
        segment.map((point) => [point.lat, point.lon]),
        {
          color: '#1f5f73',
          weight: 5,
          opacity: 0.94,
          lineJoin: 'round',
        },
      ).addTo(routeLayer);
    });

    const firstSegment = parsed.segments[0];
    const lastSegment = parsed.segments[parsed.segments.length - 1];
    const start = firstSegment[0];
    const finish = lastSegment[lastSegment.length - 1];

    L.marker([start.lat, start.lon], { icon: markerIcon('start'), title: 'Start' })
      .bindTooltip('Start')
      .addTo(routeLayer);

    L.marker([finish.lat, finish.lon], { icon: markerIcon('finish'), title: 'Finish' })
      .bindTooltip('Finish')
      .addTo(routeLayer);

    map.fitBounds(routeLayer.getBounds(), { padding: [34, 34] });

    routeName.textContent = parsed.name || 'Unnamed route';
    routeFile.textContent = fileName;
    routeDistance.textContent = formatDistance(parsed.distanceMeters);
    routePoints.textContent = parsed.pointCount.toLocaleString();
    routeCard.hidden = false;
    dropZone.hidden = true;
  }

  async function loadFile(file) {
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith('.gpx')) {
      showError('Please choose a .gpx file.');
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseGpx(text);
      renderRoute(parsed, file.name);
    } catch (error) {
      console.error(error);
      showError(error instanceof Error ? error.message : 'Could not read this GPX file.');
    }
  }

  fileInput.addEventListener('change', (event) => {
    loadFile(event.target.files?.[0]);
  });

  replaceRoute.addEventListener('click', () => {
    fileInput.click();
  });

  ['dragenter', 'dragover'].forEach((type) => {
    window.addEventListener(type, (event) => {
      event.preventDefault();
      if (!dropZone.hidden) {
        dropZone.classList.add('is-dragging');
      }
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
    if (file) {
      loadFile(file);
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !routeCard.hidden) {
      clearRoute();
    }
  });
})();
