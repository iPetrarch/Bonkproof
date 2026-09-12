# Deployment

Bonkproof is currently a static web app. It can be hosted from a subdirectory such as:

`https://petrarch.de/bonkproof/`

## Subdirectory-safe frontend

Frontend assets use relative paths (`./styles.css`, `./app.js`, later `./config/...`) so the app does not assume it is hosted at the domain root.

External resources currently used:
- Leaflet CSS/JS from `unpkg.com`
- OpenStreetMap raster tiles from `tile.openstreetmap.org`

The GPX file itself stays local in the browser and is not uploaded by Bonkproof.

## Files to publish

At minimum, publish:
- `index.html`
- `styles.css`
- `app.js`

When runtime configuration starts being consumed by the frontend, also publish:
- `config/poi-categories.json`

Do not publish repository-only files such as `.git`, local environment files, test output or development notes unless intentionally required.

## one.com target

A practical target for the current project is a web-root subdirectory named `bonkproof`, resulting in:

`https://petrarch.de/bonkproof/`

The exact remote filesystem path depends on the one.com account/SFTP setup and must be kept in a local, non-versioned deployment profile rather than committed to the repository.

## Recommended deployment workflow

For now:
1. Create the remote `bonkproof` directory if it does not exist.
2. Upload the static publish files.
3. Open `/bonkproof/` in a browser.
4. Load a known GPX file and verify map, route distance, start and finish markers.

Later, replace manual upload with a small hash-based SFTP deploy script so only changed publish files are transferred.

## Deployment secrets

Never commit:
- SFTP password
- host credentials
- private keys
- account-specific remote paths if they reveal sensitive information

Use a local ignored profile file for those values.