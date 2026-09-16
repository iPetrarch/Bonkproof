# GitHub deployment

Bonkproof can be deployed manually from GitHub Actions without a local WinSCP setup.

The non-secret production connection settings are part of the workflow:

- Host: `ssh.petrarch.de`
- User: `petrarch.de`
- Port: `22`
- Remote path: `/customers/e/4/0/petrarch.de/httpd.www/bonkproof`

## Required repository secrets

Create these under **Settings → Secrets and variables → Actions → Secrets**:

- `BONKPROOF_SFTP_PASSWORD`
- `BONKPROOF_SFTP_HOSTKEY`

`BONKPROOF_SFTP_HOSTKEY` must contain the complete WinSCP-compatible SSH host-key fingerprint already used by the working TrackKin deployment. Do not store either value in the repository.

## Run a deployment

1. Open **Actions** in the repository.
2. Select **Deploy Bonkproof**.
3. Choose **Run workflow** on `main`.
4. The workflow first runs the regression suite.
5. Only after tests pass does it install WinSCP and invoke the existing `deploy.ps1` with `-Profile home -Force`.

The workflow is intentionally manual. A merge or push to `main` does not deploy automatically.

GitHub-hosted runners are ephemeral, so the deployment uploads the complete publish set on every manual run rather than relying on the local hash-state file.
