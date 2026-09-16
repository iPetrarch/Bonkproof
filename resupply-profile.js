export function reliableResupplyCategoryIds(profile) {
  return new Set(Array.isArray(profile?.reliableCategoryIds) ? profile.reliableCategoryIds : []);
}

export function isReliableResupplyPoi(poi, profile) {
  return reliableResupplyCategoryIds(profile).has(poi?.category?.id);
}

export function filterReliableResupplyPois(pois, profile) {
  const reliable = reliableResupplyCategoryIds(profile);
  return (pois || []).filter((poi) => reliable.has(poi?.category?.id));
}

export function filterReliableSelectedPoiIds(pois, selectedPoiIds, profile, poiKey) {
  const reliable = filterReliableResupplyPois(pois, profile);
  const reliableIds = new Set(reliable.map((poi) => poiKey(poi)));
  return new Set([...selectedPoiIds].filter((id) => reliableIds.has(id)));
}
