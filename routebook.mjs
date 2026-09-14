export const ROUTEBOOK_GAP_WARNING_M = 60000;

export function poiKey(poi) {
  return `${poi.osmType}/${poi.osmId}`;
}

export function togglePoiSelection(selectedPoiIds, poiId) {
  const next = new Set(selectedPoiIds);
  if (next.has(poiId)) {
    next.delete(poiId);
  } else {
    next.add(poiId);
  }
  return next;
}

export function buildRoutebook(pois, selectedPoiIds, routeDistanceMeters) {
  const stops = pois
    .filter((poi) => selectedPoiIds.has(poiKey(poi)))
    .sort((a, b) => a.routeKm - b.routeKm || a.offRouteM - b.offRouteM);
  let previousMeters = 0;

  const entries = [
    { kind: 'start', name: 'Start', routeMeters: 0, distanceFromPreviousM: 0, isLongGap: false },
    ...stops.map((poi) => {
      const routeMeters = poi.routeKm * 1000;
      const distanceFromPreviousM = Math.max(0, routeMeters - previousMeters);
      previousMeters = routeMeters;
      return {
        kind: 'stop',
        poi,
        routeMeters,
        distanceFromPreviousM,
        isLongGap: distanceFromPreviousM > ROUTEBOOK_GAP_WARNING_M,
      };
    }),
  ];

  const distanceToFinishM = Math.max(0, routeDistanceMeters - previousMeters);
  entries.push({
    kind: 'finish',
    name: 'Finish',
    routeMeters: routeDistanceMeters,
    distanceFromPreviousM: distanceToFinishM,
    isLongGap: distanceToFinishM > ROUTEBOOK_GAP_WARNING_M,
  });

  return {
    entries,
    stops,
    longestGapM: Math.max(...entries.slice(1).map((entry) => entry.distanceFromPreviousM)),
  };
}
