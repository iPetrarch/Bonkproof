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
- **Open data first.** OpenStreetMap-derived POI data remains preferred where practical.
- **Useful before clever.** A small reliable routebook beats a feature-heavy planner.
- **Self-hostable.** Bonkproof should remain easy to run without a complex cloud stack.
- **Long-distance friendly.** Resupply gaps and practical stops matter more than generic map search.

## External services, data and privacy

Bonkproof parses the selected GPX file locally in the browser. The GPX file itself is not uploaded to a Bonkproof backend.

For supported POI categories, the production app prefers **Geoapify Places** through Bonkproof's same-origin PHP proxy. The browser sends only a route-derived bounding box and the requested POI categories to that proxy; the proxy then calls Geoapify with the server-side API key. This means the original GPX file is still not uploaded, but route-location information is sent to the Bonkproof web server and onward to Geoapify. Because Geoapify is called by the proxy, Geoapify normally sees the Bonkproof server request rather than a direct browser request.

If the Geoapify proxy is unavailable, not configured, or the requested POI category is not mapped safely, Bonkproof falls back to the public OpenStreetMap Overpass API. In that fallback case, the browser sends route-derived bounding boxes directly to `overpass-api.de`.

The web app also uses these external services:

- **OpenStreetMap data / Overpass API:** fallback POI searches may be sent to the public Overpass endpoint at `overpass-api.de`.
- **OpenStreetMap raster tiles:** the map loads tiles from OpenStreetMap infrastructure. As with normal web requests, the tile service can receive the user's IP address and standard HTTP request metadata.
- **Leaflet via unpkg:** Leaflet JavaScript and CSS are currently loaded from `unpkg.com`, so opening the app also causes requests to that CDN.

The Geoapify API key is never committed to the repository or delivered to browser JavaScript. Production deployment writes it into an ignored PHP configuration file on the server from a GitHub Actions repository secret. The proxy only accepts a fixed allowlist of POI categories and bounded search rectangles.

OpenStreetMap data is available under the Open Data Commons Open Database License (ODbL). Public use requires OpenStreetMap attribution and a clear indication of the ODbL. The map currently shows `© OpenStreetMap contributors` through Leaflet attribution. See https://www.openstreetmap.org/copyright and the OpenStreetMap Foundation attribution guidelines for the applicable requirements.

The public OpenStreetMap tile servers and public Overpass instances are shared community infrastructure, not guaranteed application backends. Bonkproof should keep fallback requests bounded and conservative, handle rate limits and temporary failures, and avoid bulk tile downloading or prefetching.

Before public production use, the site's privacy information should describe the Geoapify proxy flow, possible Overpass fallback, OpenStreetMap tile requests and unpkg dependency. Hosting or replacing these external dependencies may change that disclosure requirement.

## Status

Bonkproof is at the beginning of development. Expect breaking changes and incomplete features until the first tagged release.

Development work is tracked through GitHub Issues. See [`ROADMAP.md`](ROADMAP.md) for the current direction.

## Contributing

Issues, ideas and pull requests are welcome. For now, please open an issue before larger changes so that the scope stays intentionally small.

## License

Bonkproof is released under the [MIT License](LICENSE).
