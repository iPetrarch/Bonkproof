# Bonkproof Roadmap

This roadmap describes direction, not promises. Bonkproof will evolve in small, useful increments.

## v0.1 — Route in, useful stops out

- Load and parse a local GPX file
- Calculate basic route statistics
- Render the route on a map
- Find selected OpenStreetMap POIs near the route
- Use data-driven POI categories with per-category search radii
- Apply a configurable soft-edge/grace band instead of a razor-sharp corridor cutoff
- Project POIs onto the route and sort them by route kilometre
- Show approximate off-route distance
- Allow manually pinned POIs to survive later radius reductions

## v0.2 — Practical routebook

- Expand POI categories for food, water, toilets, bicycle service, transport, parcel lockers, accommodation and emergency use
- Filter and favourite useful stops
- Compact routebook view
- Highlight long resupply gaps
- Export selected stops
- Add an ICE (In Case of Emergency) preset that temporarily widens relevant search radii without overwriting normal settings

## Later ideas

- ETA-aware opening-hours hints
- Elevation-aware route context
- Offline-friendly caching
- PWA installation
- Shareable routebooks
- Self-hosted backend mode where external API limits require it
- Optional integration with live-tracking tools such as TrackKin

## Non-goals for now

- Turn-by-turn navigation
- Public user accounts
- Social features
- Full route planning
- Replacing dedicated navigation apps
