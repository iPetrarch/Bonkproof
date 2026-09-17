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

### TrackKin integration — planned tour handoff

Bonkproof should remain the planning and routebook tool, while TrackKin remains responsible for live tracking and tour execution. A later integration may connect both without merging the projects.

Possible workflow:

1. Load and analyse a GPX route in Bonkproof.
2. Select planned resupply or other routebook stops.
3. Export or hand off the route plus selected stop metadata to TrackKin.
4. TrackKin uses those planned stops as tour checkpoints for live distance, ETA and plan-versus-actual context.

A small versioned interchange format should be preferred over coupling either application to the other's internal storage. Candidate stop fields include a stable stop/pass ID, name, coordinates, route kilometre, category and optional descriptive metadata. Multiple passes of the same physical POI must remain distinguishable.

A later bidirectional extension may allow TrackKin to report actual, skipped or completed stops back for post-ride comparison, but this is explicitly not required for the first integration stage.

The integration must remain optional: Bonkproof must continue to work without a TrackKin account or backend, and TrackKin must not depend on Bonkproof for its core live-tracking functionality.

## Non-goals for now

- Turn-by-turn navigation
- Public user accounts
- Social features
- Full route planning
- Replacing dedicated navigation apps
