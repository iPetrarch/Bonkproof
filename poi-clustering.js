export const POI_CLUSTER_RADIUS_PX = 58;
export const POI_CLUSTER_DISABLE_ZOOM = 19;
export const POI_CLUSTER_SPIDERFY_ZOOM = 18;

export const POI_CATEGORY_COLORS = {
  supermarket: '#d6902f',
  fuel: '#1f5f73',
  unknown: '#7a8085',
};

export function clusterPoiData(pois, project, radius = POI_CLUSTER_RADIUS_PX) {
  const buckets = new Map();
  pois.forEach((poi) => {
    const point = project(poi);
    const key = `${Math.floor(point.x / radius)}:${Math.floor(point.y / radius)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(poi);
  });
  return [...buckets.values()].map((items) => ({
    items,
    isCluster: items.length > 1,
    center: {
      lat: items.reduce((sum, poi) => sum + poi.lat, 0) / items.length,
      lon: items.reduce((sum, poi) => sum + poi.lon, 0) / items.length,
    },
  }));
}

export function clusterCategoryCounts(items) {
  return items.reduce((counts, poi) => {
    counts[poi.category?.id || 'unknown'] = (counts[poi.category?.id || 'unknown'] || 0) + 1;
    return counts;
  }, {});
}

export function clusterRingStyle(items) {
  const counts = clusterCategoryCounts(items);
  const total = items.length || 1;
  let cursor = 0;
  const segments = Object.entries(counts).map(([category, count]) => {
    const start = cursor;
    cursor += (count / total) * 360;
    return `${POI_CATEGORY_COLORS[category] || POI_CATEGORY_COLORS.unknown} ${start}deg ${cursor}deg`;
  });
  return { counts, background: `conic-gradient(${segments.join(', ')})` };
}

export function clusterAccessibleLabel(items) {
  const counts = clusterCategoryCounts(items);
  const labels = { supermarket: 'Supermärkte', fuel: 'Tankstellen', unknown: 'Weitere POIs' };
  return `${items.length} POIs: ${Object.entries(counts).map(([category, count]) => `${count} ${labels[category] || labels.unknown}`).join(', ')}.`;
}
