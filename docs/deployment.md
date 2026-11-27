# Deployment

## Central DeployEngine release contract (2026-11-20)

The central Foundation workflow prepares Bonkproof releases from
`scripts/create-sftp-manifest.mjs`. The manifest is a fixed allowlist; it
contains no database, local profile or runtime data. Leaflet 1.9.4 is pinned
in `package-lock.json` and the exact browser assets used by the release are
vendored in `vendor/leaflet/`, so a release is bound entirely to its source
commit. The former workflow-local dependency download is not an artifact
source for the central path. This is release preparation only: no target,
credential or production deployment has changed.

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

The script does not delete remote files. It only creates the configured remote directory when missing and uploads changed whitelisted files.

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

## First live test

1. Configure one local profile.
2. Run `-DryRun` and confirm exactly three publish files are listed.
3. Run the real deployment.
4. Open `https://petrarch.de/bonkproof/`.
5. Load a known GPX file and verify map, route distance, start and finish markers.
6. Repeat with the second profile when that machine is available.

## Deployment secrets

Never commit:
- SFTP password
- host credentials
- private keys
- real local deployment profiles
- per-machine deployment state

The example profile files intentionally contain placeholders only.
