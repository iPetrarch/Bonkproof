import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');

test('GitHub deployment is manual and does not deploy on push automatically', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
});

test('GitHub deployment runs regression tests before the SFTP upload', () => {
  const testIndex = workflow.indexOf('Run regression tests');
  const deployIndex = workflow.indexOf('sshpass -e sftp');
  assert.ok(testIndex >= 0);
  assert.ok(deployIndex > testIndex);
});

test('GitHub deployment embeds only non-secret connection settings', () => {
  assert.match(workflow, /host='ssh\.petrarch\.de'/);
  assert.match(workflow, /user='petrarch\.de'/);
  assert.match(workflow, /port='22'/);
  assert.match(workflow, /remote='\/customers\/e\/4\/0\/petrarch\.de\/httpd\.www\/bonkproof'/);
});

test('GitHub deployment keeps password and host key in repository secrets', () => {
  assert.match(workflow, /secrets\.BONKPROOF_SFTP_PASSWORD/);
  assert.match(workflow, /secrets\.BONKPROOF_SFTP_HOSTKEY/);
  assert.doesNotMatch(workflow, /here be dragons/i);
});

test('GitHub deployment verifies the pinned host fingerprint before uploading', () => {
  const verifyIndex = workflow.indexOf('Verify SFTP host key');
  const deployIndex = workflow.indexOf('Deploy to production');
  assert.ok(verifyIndex >= 0);
  assert.ok(deployIndex > verifyIndex);
  assert.match(workflow, /ssh-keyscan/);
  assert.match(workflow, /ssh-keygen -lf/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
});

test('GitHub deployment uses direct OpenSSH SFTP without WinSCP', () => {
  assert.match(workflow, /sshpass -e sftp/);
  assert.doesNotMatch(workflow, /WinSCP/i);
  assert.doesNotMatch(workflow, /deploy\.ps1 -Profile home/);
});

test('password-authenticated SFTP is not forced into OpenSSH batch-file mode', () => {
  assert.match(workflow, /-oBatchMode=no/);
  assert.match(workflow, /PreferredAuthentications=password,keyboard-interactive/);
  assert.doesNotMatch(workflow, /\n\s+-b\s/);
});

test('GitHub deployment uploads the complete production publish set', () => {
  for (const path of [
    'index.html',
    'styles.css',
    'app.js',
    'export-model.js',
    'export-core.js',
    'routebook.js',
    'poi-search.js',
    'poi-projection.js',
    'poi-clustering.js',
    'poi-config.js',
    'resupply-profile.js',
    'config/poi-categories.json',
    'config/resupply-profile.json',
  ]) {
    assert.ok(workflow.includes(`put ${path}`), `missing deploy entry for ${path}`);
  }
});

test('GitHub deployment keeps the production upload single-flight', () => {
  assert.match(workflow, /group: bonkproof-production-deploy/);
  assert.match(workflow, /cancel-in-progress: false/);
});
