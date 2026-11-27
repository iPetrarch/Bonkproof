import { EXPORT_TARGET_PROFILES } from './export-profiles.js';
import { buildRouteGeometry } from './poi-projection.js';
import { normalizeGapSettings, poiKey } from './routebook.js';

export const PROJECT_SCHEMA_VERSION = 1;
export const PROJECT_FILE_MAX_BYTES = 128 * 1024 * 1024;
export const PROJECT_GPX_MAX_CHARS = 32 * 1024 * 1024;
const FORMAT = 'bonkproof-project';

export function newProjectId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createProject(name, state, metadata, now = new Date().toISOString()) {
  return {
    format: FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: metadata?.id ?? newProjectId(),
    name: name.trim(),
    createdAt: metadata?.createdAt ?? now,
    updatedAt: metadata?.createdAt > now ? metadata.createdAt : now,
    state,
  };
}

export function snapshotProjectPoi(poi) {
  const { osmType, osmId, passId, passIndex, passCount, lat, lon, tags, category, routeKm, offRouteM, status, name, scoped, scopeKey } = poi;
  return {
    osmType, osmId, passId, passIndex, passCount, lat, lon, tags: tags || {},
    category: { id: category.id, label: category.label, group: category.group ?? '', defaultRadiusM: category.defaultRadiusM },
    routeKm, offRouteM, status, name, scoped: Boolean(scoped), scopeKey: scopeKey ?? null,
  };
}

function requireValue(condition, field) {
  if (!condition) throw new Error(`Ungültige Projektdaten (${field}).`);
}

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
// V1 is a closed schema. Arbitrary nested extras must not be copied into IndexedDB.
const fields = (value, names) => record(value) && Object.keys(value).length === names.length
  && names.every((name) => Object.hasOwn(value, name));
const poiFields = ['osmType', 'osmId', 'passId', 'passIndex', 'passCount', 'lat', 'lon', 'tags',
  'category', 'routeKm', 'offRouteM', 'status', 'name', 'scoped', 'scopeKey'];
const text = (value, max) => typeof value === 'string' && value.length <= max;
const bounded = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const integer = (value, min, max) => Number.isSafeInteger(value) && bounded(value, min, max);
const categoryId = (value) => text(value, 80) && /^[a-z0-9][a-z0-9_-]*$/.test(value);
const isoDate = (value) => text(value, 24) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function validateList(values, validate, limit, field) {
  requireValue(Array.isArray(values) && values.length <= limit && values.every(validate), field);
}

function validateCategories(values, field) {
  validateList(values, categoryId, 500, field);
  requireValue(new Set(values).size === values.length, field);
}

function validateRadii(values, field) {
  validateList(values, (pair) => Array.isArray(pair) && pair.length === 2 && categoryId(pair[0])
    && bounded(pair[1], Number.MIN_VALUE, 100000), 500, field);
  requireValue(new Map(values).size === values.length, field);
}

function validatePois(values, routeMeters, geometry, field) {
  const edgeCount = geometry.length;
  const keys = new Set();
  validateList(values, (poi) => {
    if (!fields(poi, poiFields) || !categoryId(poi.osmType) || !(text(poi.osmId, 300) && poi.osmId.length > 0 || integer(poi.osmId, 0, Number.MAX_SAFE_INTEGER))
        || !text(poi.passId, 32) || !/^edge-(0|[1-9]\d*)$/.test(poi.passId) || !integer(Number(poi.passId.slice(5)), 0, edgeCount - 1)
        || !integer(poi.passIndex, 1, edgeCount) || !integer(poi.passCount, poi.passIndex, edgeCount)
        || !fields(poi.category, ['id', 'label', 'group', 'defaultRadiusM']) || !categoryId(poi.category.id) || !text(poi.category.label, 500) || !text(poi.category.group, 100)
        || !bounded(poi.category.defaultRadiusM, Number.MIN_VALUE, 100000)
        || !bounded(poi.lat, -90, 90) || !bounded(poi.lon, -180, 180)
        || !bounded(poi.routeKm, 0, (routeMeters + 0.01) / 1000) || !bounded(poi.offRouteM, 0, 200000)
        || !text(poi.name, 4000) || !['match', 'near-miss', 'pinned', 'retained'].includes(poi.status)
        || typeof poi.scoped !== 'boolean' || !(poi.scopeKey === null || text(poi.scopeKey, 128))
        || !record(poi.tags)) return false;
    const entries = Object.entries(poi.tags);
    if (entries.length > 512 || entries.some(([key, value]) => !text(key, 300) || !text(value, 16000))) return false;
    const edge = geometry[Number(poi.passId.slice(5))];
    const meters = poi.routeKm * 1000;
    if (!bounded(meters, edge.routeStartM - 0.01, edge.routeStartM + edge.lengthM + 0.01)) return false;
    const id = poiKey(poi);
    if (keys.has(id)) return false;
    keys.add(id);
    return true;
  }, 250000, field);
  return keys;
}

/** Validate a portable snapshot and reparse its route without DOM insertion or network activity. */
export function validateProject(project, parseRoute) {
  requireValue(record(project) && project.format === FORMAT, 'Dateiformat');
  if (project.schemaVersion !== PROJECT_SCHEMA_VERSION) throw new Error('Diese Bonkproof-Projektversion wird nicht unterstützt.');
  requireValue(fields(project, ['format', 'schemaVersion', 'id', 'name', 'createdAt', 'updatedAt', 'state']), 'Projektfelder');
  requireValue(text(project.id, 64) && /^[0-9a-f]{32}$/.test(project.id), 'Projekt-ID');
  requireValue(text(project.name, 120) && project.name.length > 0 && project.name === project.name.trim(), 'Projektname');
  requireValue(isoDate(project.createdAt) && isoDate(project.updatedAt) && project.updatedAt >= project.createdAt, 'Zeitstempel');
  const state = project.state;
  requireValue(record(state) && state.projectionVersion === 1, 'Projektionsversion');
  requireValue(fields(state, ['projectionVersion', 'route', 'global', 'scopes', 'pois', 'accepted',
    'selected', 'pins', 'gaps', 'resupply', 'exportOptions']), 'Planungsfelder');
  let parsedRoute = null;
  if (state.route !== null) {
    requireValue(fields(state.route, ['fileName', 'gpx']) && text(state.route.fileName, 1024) && text(state.route.gpx, PROJECT_GPX_MAX_CHARS)
      && !/<!DOCTYPE/i.test(state.route.gpx), 'GPX-Daten');
    parsedRoute = parseRoute(state.route.gpx);
    requireValue(record(parsedRoute) && bounded(parsedRoute.distanceMeters, 0, 200000000), 'Routenlänge');
  }
  const routeMeters = parsedRoute?.distanceMeters ?? 0;
  const geometry = parsedRoute ? buildRouteGeometry(parsedRoute) : [];
  const { global, scopes, pois, accepted, selected, pins, gaps, resupply, exportOptions } = state;
  requireValue(fields(global, ['enabled', 'radii', 'loadedRadii', 'coverage']) && ['unsearched', 'complete', 'incomplete'].includes(global.coverage), 'Suchabdeckung');
  validateCategories(global.enabled, 'globale Kategorien');
  validateRadii(global.radii, 'globale Radien');
  validateRadii(global.loadedRadii, 'geladene Radien');
  const globalRadii = new Map(global.radii);
  requireValue(global.enabled.every((id) => globalRadii.has(id)), 'Radien aktiver Kategorien');
  const scopesByKey = new Map();
  validateList(scopes, (scope) => {
    if (!fields(scope, ['start', 'end', 'enabled', 'radii']) || !bounded(scope.start, 0, routeMeters) || !bounded(scope.end, scope.start, routeMeters + 0.01) || scope.start >= scope.end) return false;
    validateCategories(scope.enabled, 'Abschnittskategorien');
    validateRadii(scope.radii, 'Abschnittsradien');
    const radii = new Map(scope.radii);
    if (!scope.enabled.length || !scope.enabled.every((id) => radii.has(id))) return false;
    const key = `${scope.start}/${scope.end}`;
    if (scopesByKey.has(key)) return false;
    scopesByKey.set(key, scope);
    return true;
  }, 10000, 'Suchabschnitte');
  const keys = validatePois(pois, routeMeters, geometry, 'POI-Bestand');
  const acceptedKeys = validatePois(accepted, routeMeters, geometry, 'übernommene Treffer');
  for (const poi of accepted) {
    const scope = scopesByKey.get(poi.scopeKey);
    requireValue(poi.scoped && scope && ['match', 'near-miss'].includes(poi.status)
      && poi.routeKm * 1000 >= scope.start - 0.002 && poi.routeKm * 1000 <= scope.end + 0.002, 'Abschnittszuordnung');
  }
  const acceptedMatches = new Set(accepted.filter((poi) => poi.status === 'match').map(poiKey));
  requireValue([...acceptedKeys].every((key) => keys.has(key))
    && pois.every((poi) => {
      const key = poiKey(poi);
      return (!poi.scoped || acceptedKeys.has(key)) && (!acceptedMatches.has(key) || poi.status === 'match');
    }), 'übernommene POI-Referenzen');
  validateList(selected, (key) => keys.has(key) || acceptedKeys.has(key), 250000, 'ausgewählte Stopps');
  validateList(pins, (key) => keys.has(key) || acceptedKeys.has(key), 250000, 'Pins');
  requireValue(new Set(selected).size === selected.length && new Set(pins).size === pins.length, 'doppelte Referenzen');
  requireValue(parsedRoute || !scopes.length && !keys.size && !acceptedKeys.size && !global.loadedRadii.length
    && global.coverage === 'unsearched', 'Planung ohne Route');
  requireValue(fields(gaps, ['criticalDistanceKm', 'infoPercent', 'warningPercent', 'criticalPercent']) && bounded(gaps.criticalDistanceKm, Number.MIN_VALUE, 10000)
    && ['infoPercent', 'warningPercent', 'criticalPercent'].every((key) => typeof gaps[key] === 'number'), 'Warnungsschwellen');
  normalizeGapSettings(gaps);
  validateCategories(resupply, 'Versorgungsprofil');
  requireValue(fields(exportOptions, ['target', 'format', 'gaps']) && typeof exportOptions.gaps === 'boolean'
    && EXPORT_TARGET_PROFILES.some(({ id, formats }) => id === exportOptions.target && formats.includes(exportOptions.format)), 'Exporteinstellungen');
  return { project, parsedRoute };
}
