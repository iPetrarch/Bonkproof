const EARTH_RADIUS_M = 6371008.8;

function toRad(value) {
  return value * Math.PI / 180;
}

function haversineMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function physicalPoiKey(poi) {
  return `${poi.osmType}/${poi.osmId}`;
}

export function buildRouteGeometry(parsed) {
  let routeOffsetM = 0;
  let geometryIndex = 0;
  const geometry = [];

  parsed.segments.forEach((points, sourceSegmentIndex) => {
    let segmentOffsetM = 0;
    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      const a = points[pointIndex - 1];
      const b = points[pointIndex];
      const lengthM = haversineMeters(a, b);
      if (lengthM === 0) continue;
      geometry.push({
        a,
        b,
        lengthM,
        routeStartM: routeOffsetM + segmentOffsetM,
        geometryIndex,
        sourceSegmentIndex,
        pointIndex: pointIndex - 1,
      });
      geometryIndex += 1;
      segmentOffsetM += lengthM;
    }
    routeOffsetM += segmentOffsetM;
  });

  return geometry;
}

function projectPointToSegment(point, segment) {
  const referenceLat = (segment.a.lat + segment.b.lat + point.lat) / 3;
  const metersPerLon = 111320 * Math.max(0.2, Math.cos(toRad(referenceLat)));
  const metersPerLat = 111320;
  const bx = (segment.b.lon - segment.a.lon) * metersPerLon;
  const by = (segment.b.lat - segment.a.lat) * metersPerLat;
  const px = (point.lon - segment.a.lon) * metersPerLon;
  const py = (point.lat - segment.a.lat) * metersPerLat;
  const denominator = bx * bx + by * by;
  const t = denominator > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / denominator)) : 0;
  const dx = px - bx * t;
  const dy = py - by * t;
  return {
    fraction: t,
    distanceM: Math.hypot(dx, dy),
    routeMeters: segment.routeStartM + segment.lengthM * t,
    lat: segment.a.lat + (segment.b.lat - segment.a.lat) * t,
    lon: segment.a.lon + (segment.b.lon - segment.a.lon) * t,
    geometryIndex: segment.geometryIndex,
    sourceSegmentIndex: segment.sourceSegmentIndex,
  };
}

export function projectPoiPassBys(point, geometry, maximumDistanceM) {
  const passBys = [];
  let previous = null;
  for (const segment of geometry) {
    const candidate = projectPointToSegment(point, segment);
    const sameTrackSegment = previous?.sourceSegmentIndex === candidate.sourceSegmentIndex;
    // An interior minimum or a vertex where the route stops approaching
    // the POI marks an encounter, independent of the requested corridor.
    if (sameTrackSegment && previous.fraction === 1 && candidate.fraction === 0) {
      if (candidate.distanceM <= maximumDistanceM) passBys.push(candidate);
    } else {
      if (!sameTrackSegment && previous?.fraction === 1 && previous.distanceM <= maximumDistanceM) passBys.push(previous);
      if ((candidate.fraction > 0 && candidate.fraction < 1 || !sameTrackSegment && candidate.fraction === 0)
          && candidate.distanceM <= maximumDistanceM) passBys.push(candidate);
    }
    previous = candidate;
  }
  if (previous?.fraction === 1 && previous.distanceM <= maximumDistanceM) passBys.push(previous);

  return passBys.map((projection, index) => ({
    ...projection,
    routeKm: projection.routeMeters / 1000,
    passIndex: index + 1,
    passCount: passBys.length,
    passId: `edge-${projection.geometryIndex}`,
  }));
}
