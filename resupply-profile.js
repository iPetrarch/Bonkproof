import { poiInsideEffectiveCorridor } from './poi-config.js';

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


export function foundResupplyPois(pois, scopedPois, enabledIds, radiusFor, profile, key) {
  const found = new Map();
  for (const poi of filterReliableResupplyPois(pois, profile)) {
    if (!poi.scoped && enabledIds.has(poi.category.id) && poi.status !== 'pinned' && poi.status !== 'retained'
        && poiInsideEffectiveCorridor(poi, radiusFor(poi.category.id))) {
      found.set(key(poi), { ...poi, status: 'match' });
    }
  }
  for (const poi of filterReliableResupplyPois([...scopedPois], profile)) {
    if (poi.status === 'match' && !found.has(key(poi))) found.set(key(poi), poi);
  }
  return [...found.values()];
}
