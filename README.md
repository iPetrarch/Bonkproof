# Bonkproof

**Find food, water and useful stops along your GPX route.**

Bonkproof is an open-source route companion for cyclists, bikepackers and other people following long GPX routes. The goal is simple: load a route, understand what is available along the way, and make better decisions before and during a ride.

Bonkproof is intentionally starting small. The first release will focus on local GPX parsing, route display and useful points of interest near the route. No account and no upload should be required for the basic workflow.

## Why Bonkproof?

A GPX track tells you where to ride, but not necessarily where you can refill bottles, buy food, find a toilet or get help with a mechanical problem. Bonkproof aims to turn a route into a practical routebook.

Examples of questions Bonkproof should eventually answer:

- Where is the next supermarket, bakery or café along my route?
- Where can I refill water?
- How far off-route is a useful stop?
- At which route kilometre will I reach it?
- Is there a long section ahead without resupply options?

## v0.1 scope

The first useful milestone is deliberately narrow:

1. Load a local GPX file in the browser.
2. Parse track or route points without uploading the file.
3. Show the route on a map.
4. Query useful POIs near the route.
5. Sort POIs by their position along the route.
6. Show route kilometre and approximate detour distance.

Everything else comes later.

## Project principles

- **Privacy-friendly by default.** Basic GPX processing should happen locally where practical.
- **Open data first.** Bonkproof prefers locally hosted Overture Maps Places data for POI lookup.
- **Useful before clever.** A small reliable routebook beats a feature-heavy planner.
- **Self-hostable.** Bonkproof should remain easy to run without a complex cloud stack.
- **Long-distance friendly.** Resupply gaps and practical stops matter more than generic map search.

## POI architecture

Production POI lookup is designed around a locally hosted SQLite database built from the monthly Overture Maps Places release. `scripts/update-overture-places.py` downloads the configured Overture release for the configured bounding box through DuckDB, normalizes relevant Overture taxonomy values to Bonkproof categories, and builds an indexed SQLite database with an RTree spatial index.

The browser requests only small bounding boxes and Bonkproof category IDs from `api/places.php`. The API performs a local indexed SQLite query and returns only matching POIs. The GPX file itself remains in the browser.

Until a local Overture database is installed on the production host, or for an unsupported provider-specific category such as a specific parcel-locker operator, the browser bridge can fall back to the existing public OpenStreetMap Overpass lookup. This keeps the application usable during migration but is not the intended long-term primary path.

See [`docs/overture-local.md`](docs/overture-local.md) for import and server setup details.

## TrackKin handoff

The export view includes a **TrackKin planned-tour handoff** target. It writes the selected routebook stops to a small versioned JSON file containing the route distance, stable stop/pass identifiers, route positions, coordinates and optional category/source metadata. Repeated passes of the same physical POI remain distinct.

The handoff is a local browser download. Bonkproof does not send it to TrackKin. In TrackKin, the rider selects the corresponding GPX separately and imports the JSON into the existing planned-stop editor, where fixed pause durations can be added or changed.

## External services, data and privacy

Bonkproof parses the selected GPX file locally in the browser. The GPX file itself is not uploaded to a Bonkproof backend.

With the local Overture database installed, POI searches send route-derived bounding boxes to Bonkproof's own `api/places.php` endpoint. Those lookups are resolved locally against the monthly Overture database and do not require a third-party live POI API request.

The web app still uses these external services:

- **OpenStreetMap data / Overpass API:** temporary fallback POI searches may be sent to the public Overpass endpoint at `overpass-api.de` if the local Overture database is unavailable or a query cannot be represented by the local provider.
- **OpenStreetMap raster tiles:** the map loads tiles from OpenStreetMap infrastructure. As with normal web requests, the tile service can receive the user's IP address and standard HTTP request metadata.
- **Leaflet via unpkg:** Leaflet JavaScript and CSS are currently loaded from `unpkg.com`, so opening the app also causes requests to that CDN.
- **Overture Maps data download:** the monthly server-side import reads Overture Places GeoParquet from Overture's public cloud distribution. End users do not contact Overture during normal POI lookup.

The public OpenStreetMap tile servers and public Overpass instances are shared community infrastructure, not guaranteed application backends. Bonkproof should keep fallback requests bounded and conservative, handle rate limits and temporary failures, and avoid bulk tile downloading or prefetching.

Before public production use, the site's privacy information should describe the local POI API, possible Overpass fallback, OpenStreetMap tile requests and unpkg dependency. Hosting or replacing these external dependencies may change that disclosure requirement.

## Status

Bonkproof is at the beginning of development. Expect breaking changes and incomplete features until the first tagged release.

Development work is tracked through GitHub Issues. See [`ROADMAP.md`](ROADMAP.md) for the current direction.

## Contributing

Issues, ideas and pull requests are welcome. For now, please open an issue before larger changes so that the scope stays intentionally small.

## License

Bonkproof is released under the [MIT License](LICENSE).
