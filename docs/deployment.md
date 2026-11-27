# Deployment

## Central DeployEngine release contract (2026-11-20)

The central Foundation workflow prepares Bonkproof releases from
`scripts/create-sftp-manifest.mjs`. The manifest is a fixed allowlist; it
contains no database, local profile or runtime data. Leaflet 1.9.4 is pinned
in `package-lock.json` and the exact browser assets used by the release are
vendored in `vendor/leaflet/`, so a release is bound entirely to its source
commit. The former workflow-local dependency download is not an artifact
source for the central path. This prepares the archive. The central production path for Bonkproof remains gated.

### Requirements for future Foundation deployment

- The [DeployEngine registry](https://github.com/iPetrarch/VPS-Foundation/blob/main/registry/deploy-engine.json) registers Bonkproof for the direct-static executor. Its [production target entry](https://github.com/iPetrarch/VPS-Foundation/blob/main/registry/deployment-targets.json) has `deployment_enabled: false`. A separately approved production enablement is required.
- The [current Direct-Static workflow](https://github.com/iPetrarch/VPS-Foundation/blob/main/.github/workflows/direct-static-update.yml) selects HeadingEast explicitly. A reviewed Bonkproof path must use Bonkproof’s registered release, source checks, target and confirmation controls.
- The [updater](https://github.com/iPetrarch/VPS-Foundation/blob/main/scripts/direct_static_update.py) verifies the existing index, canonical public root and parent directories. Provision or verify all directories before the update, including `config`, `api`, `vendor/leaflet/images` and `icons`. The current ordering puts `index.html` last and gives `sw.js` no final position. Require and test worker-last ordering before enabling Bonkproof on this path.
- Stage a release with the reviewed commit and archive checksum, verify the backup and file readback, and ensure an exclusive deployment window. Then verify HTTPS, MIME types, worker scope and offline startup with the same checklist below.

Bonkproof is currently a static web app. It can be hosted from a subdirectory such as:

`https://petrarch.de/bonkproof/`

## Subdirectory-safe frontend

Frontend assets use relative paths (`./styles.css`, `./app.js`, later `./config/...`) so the app does not assume it is hosted at the domain root.

Leaflet is vendored in the release. Online map rendering uses OpenStreetMap raster tiles from `tile.openstreetmap.org`.

The GPX file itself stays local in the browser and is not uploaded by Bonkproof.

## Files currently published

The central SFTP manifest, local PowerShell script and manual GitHub workflow publish the same release files. The lists include the application and legal pages, all reachable JavaScript modules, configuration, the POI endpoint and vendored Leaflet assets. The POI data refresh has its own workflow for the protected Overture database.

Before releasing a change to static app files, run `node scripts/update-app-shell.mjs` and `npm test`. The cache installer checks the exact bytes of the static release. Publish `sw.js` after the other application files. See [PWA deployment requirements](pwa.md).

The local PowerShell script requires Node.js for the byte-integrity check and verifies that published JavaScript imports are covered before opening a connection. The release regression test compares all three lists and walks local JavaScript dependencies starting at the application page.

## one.com target

A practical target for the current project is a web-root subdirectory named `bonkproof`, resulting in:

`https://petrarch.de/bonkproof/`

The exact remote filesystem path depends on the one.com account/SFTP setup and stays in a local, non-versioned deployment profile.

## Profile-based SFTP deployment

Bonkproof supports two local profiles:
- `home`
- `work`

Tracked templates:
- `deploy.home.example.ps1`
- `deploy.work.example.ps1`

Create the ignored local copies on each machine as needed:

```powershell
Copy-Item .\deploy.home.example.ps1 .\deploy.home.local.ps1
Copy-Item .\deploy.work.example.ps1 .\deploy.work.local.ps1
```

Fill in the local profile values:
- SFTP hostname
- port (normally 22)
- username
- remote path for `/bonkproof`
- SSH host-key fingerprint
- optionally an environment-variable name for the SFTP password
- optionally a custom path to `WinSCPnet.dll`

Do not commit the `.local.ps1` files.

## Commands

Preview what would be uploaded from the home profile:

```powershell
.\deploy.ps1 -Profile home -DryRun
```

Deploy from home:

```powershell
.\deploy.ps1 -Profile home
```

Preview from work:

```powershell
.\deploy.ps1 -Profile work -DryRun
```

Deploy from work:

```powershell
.\deploy.ps1 -Profile work
```

Force all whitelisted files to upload even when their local hashes match the saved deployment state:

```powershell
.\deploy.ps1 -Profile home -Force
```

## Incremental state

Each profile keeps its own ignored SHA-256 state file:
- `.deploy-state.home.json`
- `.deploy-state.work.json`

Only files whose current SHA-256 differs from the last successful deployment for that profile are uploaded. The state is written only after all uploads succeed.

The script uploads in allowlist order with WinSCP binary transfer and checks each transfer result. It saves the new local state only after every upload succeeds, using a temporary file followed by replacement. State reflects the last successful deployment from that profile. After a partial transfer, an external deployment or uncertain state, review a full `-DryRun -Force` and use `-Force` for the approved retry. The script creates missing target directories where required and leaves remote files outside the release untouched.

## WinSCP dependency

The script uses the WinSCP .NET assembly and looks for it in this order:
1. `WinScpAssemblyPath` from the local profile
2. environment variable `WINSCPNET_PATH`
3. `WinSCPnet.dll` in the repository root
4. standard WinSCP installation paths under `Program Files`

If it cannot find the assembly, install WinSCP or set the local path explicitly.

## Password handling

If the local profile does not supply a password or password environment variable, deployment prompts for the SFTP password securely at runtime.

For unattended use, prefer a machine-local environment variable, for example:

```powershell
$env:BONKPROOF_SFTP_PASSWORD_HOME = '...'
```

and configure:

```powershell
PasswordEnvironmentVariable = 'BONKPROOF_SFTP_PASSWORD_HOME'
```

Never commit passwords or private keys.

## Manual release procedure

1. Select the reviewed release commit. Run `npm test`, `node tests/central-sftp-manifest-test.mjs` and `node scripts/update-app-shell.mjs --check`.
2. Require a dry run before approval. On Windows run `.\deploy.ps1 -Profile home -DryRun -Force` or use the equivalent work profile. Compare the full list to the generated release manifest and confirm `sw.js` is last. Also run without `-Force` to inspect an intended incremental upload. This preview validates local files and hashes without opening a connection. The manual GitHub workflow has no dry-run input. Inspect its batch list against the same manifest before dispatch.
3. Back up the existing public application files before opening the release window. Record the target, release commit, previous hashes and files absent from the previous release. Keep the verified backup separately from the upload and confirm how to restore the previous application. Exclude parallel writers during the rollout.
4. Once production deployment is approved separately, choose one manual path. The GitHub workflow runs only through `workflow_dispatch`. It uses `sshpass`, pinned SSH host-key verification and SFTP command batch mode `-b -` with `BatchMode=no` before it so password authentication remains available. Only `mkdir` errors are tolerable. A failed `cd` or `put` stops the job and prevents later uploads. Both paths publish `sw.js` last. An interrupted upload can leave some application files replaced. Inspect the remote state and use the backup or a verified full retry.
5. Verify HTTPS, redirects and the trailing slash at `/bonkproof/`. Check the worker URL, `/bonkproof/` scope, JavaScript MIME types, manifest, CSS and PNG types against [the PWA requirements](pwa.md). On a fresh browser profile confirm the shell is ready, save a test project and verify a full offline restart and local project opening. Check an update from a prior release separately.

The automated release tests cover the allowlists, local JavaScript imports, the shell integrity table and OpenSSH batch error handling against a local subsystem when available. A local test does not verify production password authentication, host identity, server permissions, hosting or remote MIME settings. Live POI providers with a real 600-km GPX, iPhone home-screen and VoiceOver checks, and TrackKin and other target-device imports remain open.

## Deployment secrets

Never commit:
- SFTP password
- host credentials
- private keys
- real local deployment profiles
- per-machine deployment state

The example profile files intentionally contain placeholders only.
