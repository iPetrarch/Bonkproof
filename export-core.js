const TCX_NAMESPACE = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';

export function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function sanitizeExportBaseName(value, fallback = 'bonkproof-route') {
  const base = String(value || '')
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .trim()
    .replace(/[ .]+$/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
  return base || fallback;
}

function selectedRoutePoints(routePoints) {
  return (routePoints || [])
    .filter((point) => point?.selected)
    .slice()
    .sort((a, b) => Number(a.routeKm) - Number(b.routeKm));
}

function gpxPrefix(sourceGpx) {
  const match = sourceGpx.match(/<(?<prefix>[A-Za-z_][\w.-]*:)?gpx\b[^>]*>/i);
  if (!match) throw new Error('Source GPX does not contain a GPX root element.');
  return match.groups?.prefix || '';
}

function waypointXml(point, prefix = '') {
  const p = prefix;
  const name = point.name || point.categoryLabel || 'Bonkproof stop';
  const descriptionParts = [
    point.description,
    Number.isFinite(Number(point.routeKm)) ? `Route km ${Number(point.routeKm).toFixed(1)}` : null,
    point.categoryLabel,
  ].filter(Boolean);
  return [
    `  <${p}wpt lat="${Number(point.lat).toFixed(7)}" lon="${Number(point.lon).toFixed(7)}">`,
    `    <${p}name>${escapeXml(name)}</${p}name>`,
    descriptionParts.length ? `    <${p}desc>${escapeXml(descriptionParts.join(' · '))}</${p}desc>` : null,
    point.categoryLabel ? `    <${p}type>${escapeXml(point.categoryLabel)}</${p}type>` : null,
    `  </${p}wpt>`,
  ].filter(Boolean).join('\n');
}

export function serializeGpxWithRoutePoints(sourceGpx, routePoints) {
  if (typeof sourceGpx !== 'string' || !sourceGpx.trim()) {
    throw new Error('Original GPX source is required for GPX export.');
  }
  const prefix = gpxPrefix(sourceGpx);
  const selected = selectedRoutePoints(routePoints);
  if (selected.length === 0) return sourceGpx;

  const block = selected.map((point) => waypointXml(point, prefix)).join('\n');
  const routeOrTrack = new RegExp(`<(?:${prefix.replace(':', '\\:')})?(?:rte|trk)\\b`, 'i');
  const match = routeOrTrack.exec(sourceGpx);
  if (match) {
    return `${sourceGpx.slice(0, match.index)}${block}\n${sourceGpx.slice(match.index)}`;
  }

  const closingRoot = new RegExp(`</${prefix.replace(':', '\\:')}gpx\\s*>`, 'i');
  const rootMatch = closingRoot.exec(sourceGpx);
  if (!rootMatch) throw new Error('Source GPX root element is not closed.');
  return `${sourceGpx.slice(0, rootMatch.index)}${block}\n${sourceGpx.slice(rootMatch.index)}`;
}

function haversineMeters(a, b) {
  const toRad = (value) => value * Math.PI / 180;
  const earthRadius = 6371008.8;
  const dLat = toRad(Number(b.lat) - Number(a.lat));
  const dLon = toRad(Number(b.lon) - Number(a.lon));
  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function tcxTime(distanceMeters) {
  const baseMs = Date.UTC(2000, 0, 1, 0, 0, 0);
  const assumedMetersPerSecond = 5.5555555556;
  return new Date(baseMs + Math.round((distanceMeters / assumedMetersPerSecond) * 1000)).toISOString();
}

function tcxPointType(point) {
  const value = `${point.categoryId || ''} ${point.categoryLabel || ''}`.toLowerCase();
  if (/water|trink/.test(value)) return 'Water';
  if (/food|supermarket|fuel|essen|tank/.test(value)) return 'Food';
  if (/hospital|doctor|medical|pharmacy|arzt|apothek|kranken/.test(value)) return 'First Aid';
  return 'Generic';
}

function tcxCoursePointName(point) {
  const source = String(point.name || point.categoryLabel || 'Stop').trim() || 'Stop';
  return source.slice(0, 10);
}

export function serializeTcxCourse({ routeName, segments, routePoints }) {
  if (!Array.isArray(segments) || segments.length === 0 || !segments.some((segment) => segment?.length)) {
    throw new Error('Normalized route geometry is required for TCX export.');
  }

  let cumulativeMeters = 0;
  const trackBlocks = segments.filter((segment) => Array.isArray(segment) && segment.length).map((segment) => {
    let previous = null;
    const trackpoints = segment.map((point) => {
      if (previous) cumulativeMeters += haversineMeters(previous, point);
      previous = point;
      return [
        '        <Trackpoint>',
        `          <Time>${tcxTime(cumulativeMeters)}</Time>`,
        '          <Position>',
        `            <LatitudeDegrees>${Number(point.lat).toFixed(7)}</LatitudeDegrees>`,
        `            <LongitudeDegrees>${Number(point.lon).toFixed(7)}</LongitudeDegrees>`,
        '          </Position>',
        `          <DistanceMeters>${cumulativeMeters.toFixed(1)}</DistanceMeters>`,
        '        </Trackpoint>',
      ].join('\n');
    }).join('\n');
    return `      <Track>\n${trackpoints}\n      </Track>`;
  }).join('\n');

  const coursePoints = selectedRoutePoints(routePoints).map((point) => {
    const distanceMeters = Math.max(0, Number(point.routeKm) * 1000);
    const notes = [point.name, point.description, point.categoryLabel, `Route km ${Number(point.routeKm).toFixed(1)}`].filter(Boolean).join(' · ');
    return [
      '      <CoursePoint>',
      `        <Name>${escapeXml(tcxCoursePointName(point))}</Name>`,
      `        <Time>${tcxTime(distanceMeters)}</Time>`,
      '        <Position>',
      `          <LatitudeDegrees>${Number(point.lat).toFixed(7)}</LatitudeDegrees>`,
      `          <LongitudeDegrees>${Number(point.lon).toFixed(7)}</LongitudeDegrees>`,
      '        </Position>',
      `        <PointType>${tcxPointType(point)}</PointType>`,
      notes ? `        <Notes>${escapeXml(notes)}</Notes>` : null,
      '      </CoursePoint>',
    ].filter(Boolean).join('\n');
  }).join('\n');

  const safeRouteName = String(routeName || 'Bonkproof route').trim() || 'Bonkproof route';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<TrainingCenterDatabase xmlns="${TCX_NAMESPACE}">`,
    '  <Courses>',
    '    <Course>',
    `      <Name>${escapeXml(safeRouteName.slice(0, 15))}</Name>`,
    trackBlocks,
    coursePoints,
    '    </Course>',
    '  </Courses>',
    '</TrainingCenterDatabase>',
    '',
  ].filter((line) => line !== '').join('\n');
}

export function createExportFile(format, context) {
  const baseName = sanitizeExportBaseName(context?.fileName || context?.routeName);
  if (format === 'gpx') {
    return {
      content: serializeGpxWithRoutePoints(context.sourceGpx, context.routePoints),
      filename: `${baseName}-bonkproof.gpx`,
      mimeType: 'application/gpx+xml;charset=utf-8',
    };
  }
  if (format === 'tcx') {
    return {
      content: serializeTcxCourse({
        routeName: context.routeName,
        segments: context.segments,
        routePoints: context.routePoints,
      }),
      filename: `${baseName}-bonkproof.tcx`,
      mimeType: 'application/vnd.garmin.tcx+xml;charset=utf-8',
    };
  }
  throw new Error(`Unsupported export format: ${format}`);
}

export function downloadExportFile(file, browser = {}) {
  const documentObject = browser.document || globalThis.document;
  const urlObject = browser.URL || globalThis.URL;
  const BlobClass = browser.Blob || globalThis.Blob;
  if (!documentObject || !urlObject || !BlobClass) {
    throw new Error('Browser download APIs are not available.');
  }

  const objectUrl = urlObject.createObjectURL(new BlobClass([file.content], { type: file.mimeType }));
  const anchor = documentObject.createElement('a');
  anchor.href = objectUrl;
  anchor.download = file.filename;
  anchor.hidden = true;
  documentObject.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  urlObject.revokeObjectURL(objectUrl);
}
