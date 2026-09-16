export function normalizePoiDescription(tags = {}) {
  const description = typeof tags.description === 'string' ? tags.description.trim() : '';
  return description;
}

export function buildRoutePointSnapshot(poi, options = {}) {
  const {
    selectedPoiIds = new Set(),
    pinnedPoiIds = new Set(),
    poiKey = (value) => `${value.osmType}/${value.osmId}${value.passId ? `#${value.passId}` : ''}`,
  } = options;
  const id = poiKey(poi);
  const description = typeof poi.description === 'string'
    ? poi.description.trim()
    : normalizePoiDescription(poi.tags);

  return {
    id,
    name: poi.name || '',
    description,
    lat: Number(poi.lat),
    lon: Number(poi.lon),
    routeKm: Number(poi.routeKm),
    offRouteM: Number(poi.offRouteM),
    categoryId: poi.category?.id || null,
    categoryLabel: poi.category?.label || null,
    status: poi.status || null,
    selected: selectedPoiIds.has(id),
    pinned: pinnedPoiIds.has(id),
    sourceIdentity: {
      provider: 'openstreetmap',
      osmType: poi.osmType,
      osmId: poi.osmId,
    },
    passIdentity: poi.passId
      ? {
        physicalPoiId: poi.physicalPoiId || `${poi.osmType}/${poi.osmId}`,
        passId: poi.passId,
        passIndex: poi.passIndex ?? null,
        passCount: poi.passCount ?? null,
      }
      : null,
  };
}

export function buildRoutePointSnapshots(pois, options = {}) {
  return (pois || []).map((poi) => buildRoutePointSnapshot(poi, options));
}
