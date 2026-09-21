import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPORT_FORMATS,
  EXPORT_TARGET_PROFILES,
  availableExportFormats,
  getExportProfile,
} from '../export-profiles.js';

test('export profiles are data-driven and carry compatibility metadata', () => {
  assert.ok(EXPORT_TARGET_PROFILES.length >= 3);
  for (const profile of EXPORT_TARGET_PROFILES) {
    assert.ok(profile.id);
    assert.ok(profile.label);
    assert.ok(Array.isArray(profile.formats) && profile.formats.length > 0);
    assert.ok(['confirmed', 'expected', 'unknown'].includes(profile.verificationStatus));
    assert.ok(profile.note);
  }
});

test('initial profiles do not claim confirmed device compatibility', () => {
  assert.equal(EXPORT_TARGET_PROFILES.some((profile) => profile.verificationStatus === 'confirmed'), false);
});

test('GPX fallback and TCX course profiles constrain format selection', () => {
  assert.deepEqual(availableExportFormats('gpx-fallback'), ['gpx']);
  assert.deepEqual(availableExportFormats('tcx-course'), ['tcx']);
  assert.deepEqual(availableExportFormats('trackkin'), ['trackkin']);
  assert.deepEqual(availableExportFormats('missing'), ['gpx', 'tcx']);
  assert.equal(getExportProfile('trackkin').label, 'TrackKin planned-tour handoff');
  assert.equal(getExportProfile('missing').id, 'generic');
  assert.equal(EXPORT_FORMATS.gpx.label, 'GPX');
  assert.equal(EXPORT_FORMATS.tcx.label, 'TCX');
  assert.equal(EXPORT_FORMATS.trackkin.label, 'TrackKin JSON');
});
