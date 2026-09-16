#!/usr/bin/env python3
import argparse
import json
import os
import re
import sqlite3
import tempfile
from datetime import datetime, timezone

import duckdb

GERMANY_BBOX = (5.866, 47.270, 15.042, 55.059)
ALIASES = {
    'supermarket': {'supermarket', 'grocery_store'},
    'convenience': {'convenience_store'},
    'fuel': {'gas_station', 'fuel_station'},
    'bakery': {'bakery'},
    'cafe': {'cafe', 'coffee_shop'},
    'fast_food': {'fast_food', 'fast_food_restaurant'},
    'restaurant': {'restaurant'},
    'drinking_water': {'drinking_water'},
    'toilets': {'public_toilet', 'toilet'},
    'pharmacy': {'pharmacy'},
    'atm': {'atm'},
    'bicycle_shop': {'bicycle_shop', 'bike_shop'},
    'bicycle_repair_station': {'bicycle_repair', 'bicycle_repair_station'},
    'railway': {'train_station', 'railway_station'},
    'ferry': {'ferry_terminal'},
    'parcel_locker': {'parcel_locker'},
    'accommodation': {'hotel', 'guest_house', 'lodging'},
    'campsite': {'campground', 'camp_site', 'campsite'},
    'shelter': {'shelter'},
    'hospital': {'hospital'},
    'doctor': {'doctor', 'medical_clinic', 'clinic'},
    'cemetery': {'cemetery'},
}


def values_from_taxonomy(raw):
    if not raw:
        return set()
    try:
        obj = json.loads(raw) if isinstance(raw, str) else raw
    except (json.JSONDecodeError, TypeError):
        return set()
    out = set()
    if isinstance(obj, dict):
        if isinstance(obj.get('primary'), str):
            out.add(obj['primary'])
        for key in ('hierarchy', 'alternates', 'alternate'):
            if isinstance(obj.get(key), list):
                out.update(value for value in obj[key] if isinstance(value, str))
    return out


def categories_for(basic, taxonomy_raw):
    values = values_from_taxonomy(taxonomy_raw)
    if basic:
        values.add(str(basic))
    return [category for category, aliases in ALIASES.items() if values & aliases]


def main():
    parser = argparse.ArgumentParser(description='Build Bonkproof local POI SQLite database from Overture Places.')
    parser.add_argument('--release', default=os.getenv('OVERTURE_RELEASE'), help='Overture release, e.g. 2026-08-19.0')
    parser.add_argument('--output', default='data/overture-places.sqlite')
    parser.add_argument('--bbox', nargs=4, type=float, default=GERMANY_BBOX, metavar=('WEST', 'SOUTH', 'EAST', 'NORTH'))
    args = parser.parse_args()
    if not args.release:
        parser.error('--release or OVERTURE_RELEASE is required')
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}\.\d+', args.release):
        parser.error('--release must look like 2026-08-19.0')

    west, south, east, north = args.bbox
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        parser.error('--bbox is invalid')

    source = f"s3://overturemaps-us-west-2/release/{args.release}/theme=places/type=place/*"
    alias_values = sorted(set().union(*ALIASES.values()))
    alias_pattern = '|'.join(re.escape(value) for value in alias_values)

    con = duckdb.connect()
    con.execute('INSTALL spatial; LOAD spatial; INSTALL httpfs; LOAD httpfs;')
    con.execute("SET s3_region='us-west-2'")
    cursor = con.execute(f"""
        SELECT id,
               names.primary AS name,
               basic_category,
               CAST(taxonomy AS JSON) AS taxonomy_json,
               confidence,
               ST_X(geometry) AS lon,
               ST_Y(geometry) AS lat
        FROM read_parquet('{source}', filename=true, hive_partitioning=1)
        WHERE bbox.xmin BETWEEN ? AND ?
          AND bbox.ymin BETWEEN ? AND ?
          AND COALESCE(CAST(operating_status AS VARCHAR), '') <> 'permanently_closed'
          AND (
            basic_category IN ({','.join('?' for _ in alias_values)})
            OR regexp_matches(CAST(taxonomy AS VARCHAR), ?)
          )
    """, [west, east, south, north, *alias_values, alias_pattern])

    output_dir = os.path.dirname(args.output) or '.'
    os.makedirs(output_dir, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(prefix='overture-', suffix='.sqlite', dir=output_dir)
    os.close(fd)

    try:
        db = sqlite3.connect(temp_path)
        db.executescript('''
          PRAGMA journal_mode=OFF;
          PRAGMA synchronous=OFF;
          CREATE TABLE places (
            overture_id TEXT NOT NULL,
            name TEXT,
            category TEXT NOT NULL,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            confidence REAL,
            PRIMARY KEY (overture_id, category)
          );
          CREATE VIRTUAL TABLE places_rtree USING rtree(id, min_lon, max_lon, min_lat, max_lat);
          CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
          CREATE INDEX idx_places_category ON places(category);
        ''')

        inserted = 0
        while True:
            batch = cursor.fetchmany(10_000)
            if not batch:
                break
            for overture_id, name, basic, taxonomy_raw, confidence, lon, lat in batch:
                if lon is None or lat is None:
                    continue
                for category in categories_for(basic, taxonomy_raw):
                    cur = db.execute(
                        'INSERT OR IGNORE INTO places(overture_id,name,category,lat,lon,confidence) VALUES(?,?,?,?,?,?)',
                        (str(overture_id), name, category, float(lat), float(lon), confidence),
                    )
                    if cur.rowcount:
                        rowid = cur.lastrowid
                        db.execute(
                            'INSERT INTO places_rtree(id,min_lon,max_lon,min_lat,max_lat) VALUES(?,?,?,?,?)',
                            (rowid, float(lon), float(lon), float(lat), float(lat)),
                        )
                        inserted += 1
            db.commit()

        metadata = {
            'overture_release': args.release,
            'imported_at': datetime.now(timezone.utc).isoformat(),
            'bbox': ','.join(map(str, args.bbox)),
            'place_category_rows': str(inserted),
        }
        db.executemany('INSERT INTO metadata(key,value) VALUES(?,?)', metadata.items())
        db.commit()
        db.execute('VACUUM')
        db.close()
        os.replace(temp_path, args.output)
        print(f'Wrote {inserted} categorized place rows to {args.output}')
    except Exception:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise
    finally:
        con.close()


if __name__ == '__main__':
    main()
