const category = { id: 'supermarket', label: 'Supermarket' };

function poi({ osmId, name, routeKm, lat = 53, lon = 7, offRouteM = 20, passId = null, passIndex = null, passCount = null }) {
  return {
    osmType: 'node',
    osmId,
    name,
    routeKm,
    lat,
    lon,
    offRouteM,
    status: 'match',
    category,
    ...(passId ? { passId, passIndex, passCount } : {}),
  };
}

export const routeOrderCases = {
  selfCrossing: {
    description: 'two distinct POIs near the same crossing still follow ride progression',
    routeDistanceM: 80000,
    pois: [
      poi({ osmId: 101, name: 'Crossing first pass', routeKm: 18, lat: 53.1, lon: 7.1 }),
      poi({ osmId: 102, name: 'Crossing later pass', routeKm: 61, lat: 53.10003, lon: 7.10002 }),
    ],
    expectedOrder: ['Crossing first pass', 'Crossing later pass'],
  },
  outboundInbound: {
    description: 'same physical road can contain stops encountered in different travel phases',
    routeDistanceM: 100000,
    pois: [
      poi({ osmId: 201, name: 'Outbound stop', routeKm: 22, lat: 53.2, lon: 7.2 }),
      poi({ osmId: 202, name: 'Inbound stop', routeKm: 78, lat: 53.20004, lon: 7.20004 }),
    ],
    expectedOrder: ['Outbound stop', 'Inbound stop'],
  },
  repeatedPhysicalPoi: {
    description: 'one physical POI may have more than one independently selectable route pass-by',
    routeDistanceM: 120000,
    pois: [
      poi({ osmId: 301, name: 'Village shop', routeKm: 31, lat: 53.3, lon: 7.3, offRouteM: 15, passId: 'pass-1', passIndex: 1, passCount: 2 }),
      poi({ osmId: 301, name: 'Village shop', routeKm: 94, lat: 53.3, lon: 7.3, offRouteM: 18, passId: 'pass-2', passIndex: 2, passCount: 2 }),
    ],
    expectedRouteKm: [31, 94],
  },
  nearbyPois: {
    description: 'nearby coordinates must not replace route progression ordering',
    routeDistanceM: 70000,
    pois: [
      poi({ osmId: 401, name: 'Later nearby shop', routeKm: 45, lat: 53.4, lon: 7.40001 }),
      poi({ osmId: 402, name: 'Earlier nearby fuel', routeKm: 12, lat: 53.4, lon: 7.4 }),
    ],
    expectedOrder: ['Earlier nearby fuel', 'Later nearby shop'],
  },
  closeStartFinish: {
    description: 'route progress remains meaningful when start and finish are spatially close',
    routeDistanceM: 90000,
    pois: [
      poi({ osmId: 501, name: 'Late stop near start', routeKm: 84, lat: 53.00002, lon: 7.00001 }),
      poi({ osmId: 502, name: 'Early stop', routeKm: 8, lat: 53.01, lon: 7.01 }),
    ],
    expectedOrder: ['Early stop', 'Late stop near start'],
  },
  noisyGeometry: {
    description: 'small coordinate noise must not disturb already resolved route positions',
    routeDistanceM: 60000,
    pois: [
      poi({ osmId: 601, name: 'Noisy first', routeKm: 14.2, lat: 53.50008, lon: 7.50003, offRouteM: 27 }),
      poi({ osmId: 602, name: 'Noisy second', routeKm: 39.7, lat: 53.49996, lon: 7.49991, offRouteM: 33 }),
    ],
    expectedOrder: ['Noisy first', 'Noisy second'],
  },
};
