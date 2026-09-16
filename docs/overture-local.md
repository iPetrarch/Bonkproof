# Local Overture Places database

Bonkproof is designed to use a locally hosted SQLite database built from Overture Maps Places as its primary POI source.

## Data flow

1. A monthly maintenance job downloads only the configured geographic area from an Overture Places release.
2. `scripts/update-overture-places.py` maps relevant Overture taxonomy values to Bonkproof categories and writes a compact SQLite database with an RTree spatial index.
3. `api/places.php` queries that local database by bounding box and category.
4. Browser-side route projection, pass-by handling, gap analysis and routebook logic remain unchanged.
5. Overpass remains a temporary fallback while the local database is missing or a provider-specific query cannot be represented locally.

No Geoapify key or other live POI API key is required.

## Current Overture source

The importer expects an explicit Overture release name, for example:

```bash
python3 scripts/update-overture-places.py --release 2026-08-19.0
```

The importer uses the Overture AWS GeoParquet distribution and DuckDB's `httpfs` and `spatial` extensions. Overture release names must not be guessed permanently in automation; the maintenance workflow discovers the latest available release unless a release is explicitly supplied.

The default import bounding box covers Germany approximately:

```text
5.866,47.270,15.042,55.059
```

A custom bounding box can be supplied with `--bbox WEST SOUTH EAST NORTH`.

## Requirements

Python packages:

```bash
python3 -m pip install duckdb
```

DuckDB installs/loads its `spatial` and `httpfs` extensions when the importer runs.

## Output

Default output:

```text
data/overture-places.sqlite
```

The database contains:

- `places`: Overture ID, normalized Bonkproof category, name, coordinate and confidence.
- `places_rtree`: spatial RTree for fast bounding-box lookup.
- `metadata`: Overture release, import time, import bounding box and row count.

The database file is generated data and must not be committed.

## Production database path

`api/places.php` checks `BONKPROOF_OVERTURE_DB` first. If that environment variable is not set, it expects:

```text
<bonkproof-web-root>/data/overture-places.sqlite
```

The current one.com SFTP account cannot create the originally planned sibling directory outside `httpd.www`. The production database therefore lives inside the Bonkproof tree, but the entire `data` directory is protected from direct HTTP access by `data/.htaccess`. PHP accesses the SQLite file directly through the filesystem; browser requests must use `api/places.php`.

The refresh workflow verifies that it can enter the target data directory before uploading. It also removes the accidental legacy root-level `httpd.www/overture-places.sqlite` file after a successful protected upload.

## Monthly update strategy

The intended production flow is:

1. Build a new database into a temporary file on the GitHub runner.
2. Run integrity and plausibility checks against the new file.
3. Transfer it to the protected production data directory under a temporary name.
4. Atomically rename the temporary database into place after a successful transfer.
5. Keep the previous database long enough for rollback.

Do not replace the production database in-place while requests may be reading it.

## Taxonomy maintenance

Overture is replacing the deprecated legacy `categories` field with `basic_category` and `taxonomy`. The importer already reads the new fields. Category aliases in `ALIASES` are deliberately isolated in `scripts/update-overture-places.py` so taxonomy changes can be reviewed without changing browser logic.

After each major Overture taxonomy release, compare at least these categories on known routes:

- supermarket
- fuel
- drinking water
- bakery
- cafe
- pharmacy
- bicycle shop
- railway station
- accommodation

Coverage quality should be compared against known local places before disabling Overpass fallback entirely.
