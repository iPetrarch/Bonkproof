# POI filter UX

This document defines the intended interaction model for Bonkproof's route-based POI discovery.

## Goals

The POI filter should be fast to understand while still allowing category-specific control. The user should always be able to answer three questions at a glance:

1. Which POI categories are active?
2. How far away from the route may each category be?
3. Which results are normal matches, near misses, or explicitly pinned?

## Category groups

Categories are presented in collapsible groups rather than one flat list.

Suggested groups:

- Food & drink
- Water & hygiene
- Bicycle support
- Transport
- Parcels & logistics
- Overnight
- Medical & emergency
- Other useful stops

Each group has a summary row and can be expanded to reveal individual categories.

## Category row

Each category row contains:

- an enable/disable toggle
- category name and icon
- current radius
- a compact radius control
- optional result count after a route has been loaded

Example:

`[on] Supermarket   250 m   14`

Tapping the radius opens a small set of common values and an advanced custom input.

Suggested quick values:

- 250 m
- 500 m
- 1 km
- 2 km
- 5 km
- Custom

Category defaults come from `config/poi-categories.json` and remain user-adjustable.

## Soft edge / near miss

The configured radius is the normal-match boundary, not a razor-sharp visibility cutoff.

Classification:

- **match** — POI is within the configured category radius
- **near miss** — POI is just outside the radius but still within the configured grace band
- **excluded** — POI is beyond radius + grace unless pinned
- **pinned** — explicitly kept by the user and therefore not removed by later radius reductions

Near misses must remain honest: always show the actual off-route distance and make the status visually distinguishable from a normal match.

Example:

- category radius: 250 m
- POI distance: 275 m
- result: visible as a near miss, not presented as if it were inside 250 m

## Map interaction

Clicking/tapping a POI marker opens a compact detail card containing at least:

- POI name/type
- route kilometre
- actual off-route distance
- match state: normal / near miss / pinned
- pin/unpin action
- source attribution or OSM identity where useful

Selecting a POI in the routebook highlights the same POI on the map and vice versa.

## Pinning

Pinning means: "keep this stop visible even if my filters would normally remove it."

Rules:

- Pinned POIs survive category radius reductions.
- Pinned POIs survive disabling the source category in the current routebook view unless the user explicitly chooses a strict-hide mode later.
- Pinned state is visibly distinct from automatic matches.
- Unpinning returns the POI to normal filtering rules immediately.

For v0.1, pinning can be session-local. Persistence/export can follow later.

## Radius changes

Changing a category radius updates map markers and routebook results without reloading the GPX.

If the required radius is within the already fetched OSM search envelope, filtering should happen locally.

If the new radius exceeds the currently fetched envelope, Bonkproof may issue a broader POI query and merge/deduplicate results before re-filtering.

## Default view

To avoid visual overload, only a small set of high-value categories should be active by default.

Suggested default-on categories:

- supermarket
- fuel station
- drinking water
- toilets
- bicycle shop / repair
- railway station / halt

All other categories remain available but default to off unless user testing suggests otherwise.

## ICE preset

ICE means **In Case of Emergency**.

ICE is a temporary overlay, not a replacement for normal settings. It can widen radii and enable categories that become relevant when a ride goes wrong, for example:

- railway stations
- bicycle repair
- pharmacy
- medical care
- supermarkets
- fuel stations
- shelters
- cemeteries

Turning ICE off restores the previous normal category state and radii unchanged.

## Cemetery handling

Cemeteries are a dedicated category because they can be useful on long rides, including as possible locations for water taps.

Bonkproof must not infer potable water merely from a cemetery POI. If a separately mapped drinking-water point exists at or within the cemetery, it can be shown as a drinking-water POI based on that explicit source data.

## Future interaction ideas

Not required for v0.1, but the UX should leave room for:

- saved user presets
- profile presets such as Minimal, Road, Bikepacking and ICE
- a temporary "show more around here" action for one route segment
- long-gap warnings (for example no supermarket or water for the next N km)
- ETA/opening-hours context
- routebook export with pinned stops
