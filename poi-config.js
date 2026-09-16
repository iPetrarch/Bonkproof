export function normalizeCategoryRadius(category, overrideRadiusM = null) {
  const configured = Number(overrideRadiusM ?? category?.defaultRadiusM);
  if (!Number.isFinite(configured) || configured <= 0) {
    throw new RangeError(`Invalid radius for POI category ${category?.id || 'unknown'}.`);
  }
  return configured;
}

export function categoryWithRadius(category, overrideRadiusM = null) {
  return { ...category, radiusM: normalizeCategoryRadius(category, overrideRadiusM) };
}

export function buildActiveCategories(config, enabledIds, radiusOverrides = new Map()) {
  const enabled = enabledIds instanceof Set ? enabledIds : new Set(enabledIds || []);
  return (config?.categories || [])
    .filter((category) => enabled.has(category.id))
    .map((category) => categoryWithRadius(category, radiusOverrides.get(category.id)));
}

export function defaultEnabledCategoryIds(config) {
  return new Set((config?.categories || []).filter((category) => category.defaultEnabled).map((category) => category.id));
}

export function defaultCategoryRadii(config) {
  return new Map((config?.categories || []).map((category) => [category.id, normalizeCategoryRadius(category)]));
}

function tagsMatch(tags, matcher) {
  return Object.entries(matcher || {}).every(([key, value]) => tags?.[key] === value);
}

export function categoryMatchesTags(category, tags = {}) {
  const osm = category?.osm || {};
  const anyOf = osm.anyOf || [];
  const allOf = osm.allOf || [];
  const providerAnyOf = osm.providerAnyOf || [];

  const baseMatches = anyOf.length > 0
    ? anyOf.some((matcher) => tagsMatch(tags, matcher))
    : allOf.length > 0 && allOf.every((matcher) => tagsMatch(tags, matcher));
  if (!baseMatches) return false;
  return providerAnyOf.length === 0 || providerAnyOf.some((matcher) => tagsMatch(tags, matcher));
}

export function matchingCategory(element, categories) {
  return categories.find((category) => categoryMatchesTags(category, element?.tags || {})) || null;
}

function escapeOverpass(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function selectorsForMatcher(matcher) {
  return Object.entries(matcher || {}).map(([key, value]) => `["${escapeOverpass(key)}"="${escapeOverpass(value)}"]`).join('');
}

export function categoryQueryStatements(category, bbox) {
  const osm = category?.osm || {};
  const bboxText = bbox.join(',');
  const statements = [];

  (osm.anyOf || []).forEach((matcher) => {
    statements.push(`nwr${selectorsForMatcher(matcher)}(${bboxText});`);
  });

  if ((osm.allOf || []).length > 0) {
    const base = (osm.allOf || []).map(selectorsForMatcher).join('');
    if ((osm.providerAnyOf || []).length > 0) {
      (osm.providerAnyOf || []).forEach((provider) => {
        statements.push(`nwr${base}${selectorsForMatcher(provider)}(${bboxText});`);
      });
    } else {
      statements.push(`nwr${base}(${bboxText});`);
    }
  }

  return [...new Set(statements)];
}

export function buildOverpassQuery(categories, bbox) {
  const statements = categories.flatMap((category) => categoryQueryStatements(category, bbox));
  return `[out:json][timeout:30];(${statements.join('')});out center tags;`;
}

export function getGraceMeters(category, config) {
  const softEdge = config?.corridor?.softEdge;
  if (!softEdge?.enabled) return 0;
  const radiusM = Number(category?.radiusM ?? category?.defaultRadiusM);
  return Math.min(
    Number(softEdge.maximumGraceM) || Infinity,
    Math.max(Number(softEdge.minimumGraceM) || 0, radiusM * (Number(softEdge.percentage) || 0)),
  );
}
