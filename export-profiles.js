export const EXPORT_TARGET_PROFILES = [
  {
    id: 'generic',
    label: 'Unspecified device / app',
    formats: ['gpx', 'tcx'],
    routePoints: 'unknown',
    verificationStatus: 'unknown',
    note: 'Choose the file format your destination accepts. Bonkproof does not assume that custom route points will be shown unless that behavior has been verified.',
  },
  {
    id: 'gpx-fallback',
    label: 'GPX file fallback',
    formats: ['gpx'],
    routePoints: 'limited',
    verificationStatus: 'expected',
    note: 'GPX is the universal fallback. Bonkproof adds selected stops as waypoints, but many bike computers do not display imported GPX waypoints as route POIs.',
  },
  {
    id: 'tcx-course',
    label: 'TCX Course-compatible device / app',
    formats: ['tcx'],
    routePoints: 'expected',
    verificationStatus: 'expected',
    note: 'TCX carries selected stops as CoursePoints. Exact display and import behavior still depends on the target device or app and is not yet marked as confirmed.',
  },
];

export const EXPORT_FORMATS = {
  gpx: {
    id: 'gpx',
    label: 'GPX',
    note: 'Preserves the original GPX route content and adds selected stops as waypoints.',
  },
  tcx: {
    id: 'tcx',
    label: 'TCX',
    note: 'Builds a TCX Course from Bonkproof route geometry and adds selected stops as CoursePoints.',
  },
};

export function getExportProfile(profileId) {
  return EXPORT_TARGET_PROFILES.find((profile) => profile.id === profileId) || EXPORT_TARGET_PROFILES[0];
}

export function availableExportFormats(profileId) {
  return [...getExportProfile(profileId).formats];
}
