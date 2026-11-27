import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

test('SFTP batch mode preserves password auth and treats cd and put as strict commands', () => {
  const upload = workflow.slice(workflow.indexOf('sshpass -e sftp'));
  const options = upload.slice(0, upload.indexOf('<<EOF'));
  assert.match(options, /-oBatchMode=no\s+\\\n\s+-b -(?=\s)/);
  assert.match(options, /PreferredAuthentications=password,keyboard-interactive/);
  assert.match(options, /PubkeyAuthentication=no/);
  assert.match(options, /StrictHostKeyChecking=yes/);
  const batch = upload.slice(upload.indexOf('<<EOF')).split('\n').slice(1);
  const commands = batch.slice(0, batch.findIndex((line) => line.trim() === 'EOF')).map((line) => line.trim());
  assert.equal(commands[0], '-mkdir $remote');
  assert.equal(commands[1], 'cd $remote');
  assert.equal(commands.at(-1), 'bye');
  assert.equal(commands.at(-2), 'put sw.js');
  assert.ok(commands.every((line) => /^(?:-mkdir |cd |put |bye$)/.test(line)));
  assert.ok(workflow.slice(workflow.indexOf('name: Deploy to production')).includes('set -euo pipefail'));
});

const localSftp = '/usr/bin/sftp';
const localServer = '/usr/lib/openssh/sftp-server';
test('local OpenSSH tolerates an existing directory and aborts on cd or put failures', {
  skip: !fs.existsSync(localSftp) || !fs.existsSync(localServer),
}, () => {
  const directory = fs.mkdtempSync(join(tmpdir(), 'bonk-batch-'));
  try {
    fs.mkdirSync(join(directory, 'target'));
    fs.writeFileSync(join(directory, 'input'), 'test payload');
    // Directly connect the client to a local subsystem over stdio. No SSH connection.
    const run = (commands) => {
      const stdin = join(directory, 'batch');
      const output = join(directory, 'output');
      fs.writeFileSync(stdin, commands.join('\n') + '\n');
      const inFd = fs.openSync(stdin, 'r');
      const outFd = fs.openSync(output, 'w');
      try {
        const result = spawnSync(localSftp, ['-q', '-oBatchMode=no', '-b', '-', '-D', localServer], {
          cwd: directory, stdio: [inFd, outFd, outFd], timeout: 10000,
        });
        if (result.error) throw result.error;
        return { status: result.status, output: fs.readFileSync(output, 'utf8') };
      } finally {
        fs.closeSync(inFd);
        fs.closeSync(outFd);
      }
    };
    assert.equal(run(['-mkdir target', 'cd target', 'put input received', 'bye']).status, 0);
    assert.equal(fs.readFileSync(join(directory, 'target', 'received'), 'utf8'), 'test payload');
    for (const errorCommand of ['cd absent', 'put absent failed', 'put input absent/failed']) {
      const result = run(['cd target', errorCommand, 'put input forbidden', 'bye']);
      assert.equal(result.status, 1, result.output);
      assert.equal(fs.existsSync(join(directory, 'target', 'forbidden')), false);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('GitHub deployment uploads the complete production publish set', () => {
  for (const path of [
    'index.html',
    'styles.css',
    'app.js',
    'export-model.js',
    'export-core.js',
    'export-profiles.js',
    'export-gap-warnings.js',
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
