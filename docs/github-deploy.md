# GitHub deployment

Bonkproof can be deployed manually from GitHub Actions without a local WinSCP setup.

## Required repository secrets

Create these under **Settings → Secrets and variables → Actions → Secrets**:

- `BONKPROOF_SFTP_HOST`
- `BONKPROOF_SFTP_USER`
- `BONKPROOF_SFTP_PASSWORD`
- `BONKPROOF_SFTP_HOSTKEY`
- `BONKPROOF_SFTP_REMOTE_PATH`

The host key must use the WinSCP-compatible fingerprint already used by the local deployment profile. `BONKPROOF_SFTP_REMOTE_PATH` must point to the Bonkproof directory only.

## Optional repository variable

Under **Settings → Secrets and variables → Actions → Variables** you may set:

- `BONKPROOF_SFTP_PORT`

If omitted, the workflow uses port `22`.

## Run a deployment

1. Open **Actions** in the repository.
2. Select **Deploy Bonkproof**.
3. Choose **Run workflow** on `main`.
4. The workflow first runs the regression suite.
5. Only after tests pass does it install WinSCP and invoke the existing `deploy.ps1` with `-Profile home -Force`.

The workflow is intentionally manual. A merge or push to `main` does not deploy automatically.

GitHub-hosted runners are ephemeral, so the deployment uploads the complete publish set on every manual run rather than relying on the local hash-state file.
