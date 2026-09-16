import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');

test('GitHub deployment is manual and does not deploy on push automatically', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
});

test('GitHub deployment runs regression tests before invoking the existing deploy script', () => {
  const testIndex = workflow.indexOf('Run regression tests');
  const deployIndex = workflow.indexOf('.\\deploy.ps1 -Profile home -Force');
  assert.ok(testIndex >= 0);
  assert.ok(deployIndex > testIndex);
});

test('GitHub deployment requires SFTP secrets without embedding credentials', () => {
  for (const name of [
    'BONKPROOF_SFTP_HOST',
    'BONKPROOF_SFTP_USER',
    'BONKPROOF_SFTP_PASSWORD',
    'BONKPROOF_SFTP_HOSTKEY',
    'BONKPROOF_SFTP_REMOTE_PATH',
  ]) {
    assert.match(workflow, new RegExp(`secrets\\.${name}`));
  }
  assert.match(workflow, /PasswordEnvironmentVariable = 'BONKPROOF_SFTP_PASSWORD'/);
});

test('GitHub deployment keeps the production upload single-flight', () => {
  assert.match(workflow, /group: bonkproof-production-deploy/);
  assert.match(workflow, /cancel-in-progress: false/);
});
