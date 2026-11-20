#!/usr/bin/env node
import {existsSync, writeFileSync} from 'node:fs';

const [commit, output] = process.argv.slice(2);
if (!/^[a-f0-9]{40}$/.test(commit ?? '') || !output) {
  console.error('Usage: node scripts/create-sftp-manifest.mjs <full-lowercase-commit-sha> <output.json>');
  process.exit(2);
}
const files = [
  'index.html', 'impressum.html', 'datenschutz.html', 'styles.css', 'app.js',
  'export-model.js', 'export-core.js', 'export-profiles.js', 'export-gap-warnings.js',
  'routebook.js', 'poi-search.js', 'poi-projection.js', 'poi-clustering.js',
  'poi-config.js', 'poi-provider-overture.js', 'resupply-profile.js',
  'config/poi-categories.json', 'config/resupply-profile.json', 'api/places.php',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/leaflet/LICENSE',
  'vendor/leaflet/images/layers.png', 'vendor/leaflet/images/layers-2x.png',
  'vendor/leaflet/images/marker-icon.png', 'vendor/leaflet/images/marker-icon-2x.png',
  'vendor/leaflet/images/marker-shadow.png',
];
if (!files.every(existsSync) || new Set(files).size !== files.length) {
  throw new Error('Bonkproof source release allowlist is incomplete');
}
writeFileSync(output, JSON.stringify({
  service: 'bonkproof', repository: 'iPetrarch/Bonkproof', commit, files,
  mappings: files.map((source) => ({source, destination: source})),
}, null, 2) + '\n');
