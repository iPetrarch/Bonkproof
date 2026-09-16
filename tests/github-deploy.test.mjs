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

test('GitHub deployment embeds only non-secret connection settings', () => {
  assert.match(workflow, /HostName = 'ssh\.petrarch\.de'/);
  assert.match(workflow, /UserName = 'petrarch\.de'/);
  assert.match(workflow, /PortNumber = 22/);
  assert.match(workflow, /RemotePath = '\/customers\/e\/4\/0\/petrarch\.de\/httpd\.www\/bonkproof'/);
});

test('GitHub deployment keeps password and host key in repository secrets', () => {
  assert.match(workflow, /secrets\.BONKPROOF_SFTP_PASSWORD/);
  assert.match(workflow, /secrets\.BONKPROOF_SFTP_HOSTKEY/);
  assert.match(workflow, /PasswordEnvironmentVariable = 'BONKPROOF_SFTP_PASSWORD'/);
  assert.match(workflow, /SshHostKeyFingerprint = \$env:BONKPROOF_SFTP_HOSTKEY/);
  assert.doesNotMatch(workflow, /here be dragons/i);
});

test('GitHub deployment uses the WinSCP .NET Standard assembly for PowerShell Core', () => {
  assert.ok(workflow.includes("WinScpAssemblyPath = 'C:\\Program Files (x86)\\WinSCP\\netstandard2.0\\WinSCPnet.dll'"));
  assert.ok(workflow.includes("WinScpExecutablePath = 'C:\\Program Files (x86)\\WinSCP\\WinSCP.exe'"));
});

test('GitHub deployment keeps the production upload single-flight', () => {
  assert.match(workflow, /group: bonkproof-production-deploy/);
  assert.match(workflow, /cancel-in-progress: false/);
});
