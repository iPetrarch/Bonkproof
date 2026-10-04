export function buildPoiPassIndex(pois, physicalPoiKey) {
  const index = new Map();
  for (const poi of pois || []) {
    const physicalId = poi.physicalPoiId || physicalPoiKey(poi);
    const passes = index.get(physicalId);
    if (passes) passes.push(poi);
    else index.set(physicalId, [poi]);
  }
  for (const passes of index.values()) {
    passes.sort((a, b) => a.routeKm - b.routeKm || a.offRouteM - b.offRouteM);
  }
  return index;
}
