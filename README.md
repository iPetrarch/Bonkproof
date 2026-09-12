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
4. Query useful OpenStreetMap POIs near the route.
5. Sort POIs by their position along the route.
6. Show route kilometre and approximate detour distance.

Everything else comes later.

## Project principles

- **Privacy-friendly by default.** Basic GPX processing should happen locally where practical.
- **Open data first.** OpenStreetMap is the preferred POI source.
- **Useful before clever.** A small reliable routebook beats a feature-heavy planner.
- **Self-hostable.** Bonkproof should remain easy to run without a complex cloud stack.
- **Long-distance friendly.** Resupply gaps and practical stops matter more than generic map search.

## Status

Bonkproof is at the beginning of development. Expect breaking changes and incomplete features until the first tagged release.

Development work is tracked through GitHub Issues. See [`ROADMAP.md`](ROADMAP.md) for the current direction.

## Contributing

Issues, ideas and pull requests are welcome. For now, please open an issue before larger changes so that the scope stays intentionally small.

## License

Bonkproof is released under the [MIT License](LICENSE).
