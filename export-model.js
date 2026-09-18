export function normalizePoiDescription(tags = {}) {
  const description = typeof tags.description === 'string' ? tags.description.trim() : '';
  return description;
}

function buildSourceIdentity(poi) {
  if (poi.sourceIdentity && typeof poi.sourceIdentity === 'object') {
    return { ...poi.sourceIdentity };
  }
  if (poi.osmType === 'overture') {
    return { provider: 'overture', id: poi.osmId };
  }
  if (poi.osmType === 'node' || poi.osmType === 'way' || poi.osmType === 'relation') {
    return { provider: 'openstreetmap', osmType: poi.osmType, osmId: poi.osmId };
  }
  return { provider: 'unknown', type: poi.osmType ?? null, id: poi.osmId ?? null };
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
    sourceIdentity: buildSourceIdentity(poi),
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
