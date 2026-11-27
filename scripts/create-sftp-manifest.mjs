#!/usr/bin/env node
import {existsSync, writeFileSync} from 'node:fs';
import { updateAppShell } from './update-app-shell.mjs';

const [commit, output] = process.argv.slice(2);
if (!/^[a-f0-9]{40}$/.test(commit ?? '') || !output) {
  console.error('Usage: node scripts/create-sftp-manifest.mjs <full-lowercase-commit-sha> <output.json>');
  process.exit(2);
}
const files = [
  'index.html', 'impressum.html', 'datenschutz.html', 'styles.css', 'app.js',
  'export-model.js', 'export-core.js', 'export-profiles.js', 'export-gap-warnings.js',
  'routebook.js', 'poi-search.js', 'poi-projection.js', 'poi-pass-index.js', 'poi-clustering.js',
  'project-format.js', 'project-store.js', 'project-workspace.js',
  'poi-config.js', 'poi-provider-overture.js', 'resupply-profile.js',
  'config/poi-categories.json', 'config/resupply-profile.json', 'api/places.php',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/leaflet/LICENSE',
  'vendor/leaflet/images/layers.png', 'vendor/leaflet/images/layers-2x.png',
  'vendor/leaflet/images/marker-icon.png', 'vendor/leaflet/images/marker-icon-2x.png',
  'vendor/leaflet/images/marker-shadow.png',
  'manifest.json', 'pwa.js', 'icons/bonkproof-192.png', 'icons/bonkproof-512.png', 'icons/apple-touch-icon.png', 'sw.js',
];
if (!files.every(existsSync) || new Set(files).size !== files.length) {
  throw new Error('Bonkproof source release allowlist is incomplete');
}
updateAppShell({ check: true });
writeFileSync(output, JSON.stringify({
  service: 'bonkproof', repository: 'iPetrarch/Bonkproof', commit, files,
  mappings: files.map((source) => ({source, destination: source})),
}, null, 2) + '\n');
