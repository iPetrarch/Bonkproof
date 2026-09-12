# Bonkproof UI layout

This document defines the first interaction model for Bonkproof. It is intentionally simple and optimized for route inspection on phones, tablets and desktops.

## Core principle

The map is the primary workspace. Filters, routebook items and warnings are secondary layers that should never permanently cover too much of the route.

## Mobile and tablet

Use a full-screen map with a bottom sheet.

Bottom sheet states:
- collapsed: compact summary, route length, active POI count, warning count
- half: tabs for POIs, Routebook, Warnings, Export
- expanded: detailed category settings, routebook details or export options

A floating action button opens the POI/filter view when the sheet is collapsed.

The bottom sheet must remain draggable so the user can quickly switch between map context and detailed information.

## Desktop

Use a large map with a resizable left sidebar.

Sidebar tabs:
- POIs
- Routebook
- Warnings
- Export

The map remains visible while editing category radii or selecting routebook items.

## Initial route state

Before a GPX is loaded:
- prominent local GPX picker / drop target
- short explanation that files are parsed locally for the basic workflow
- no empty map chrome unless useful

After loading:
- route is fitted into view
- start and finish are distinguishable
- route length and point count are visible
- user can replace the route without reloading the app

## POI interaction

POI categories are grouped and collapsible.

Each category row should contain:
- enabled toggle
- category name / icon
- result count
- configured route corridor radius
- quick radius control

Suggested quick values:
- 250 m
- 500 m
- 1 km
- 2 km
- 5 km
- custom

Changing a radius should update map markers and routebook results immediately where cached data permits.

POI display states:
- normal match: inside configured category radius
- near miss: inside the soft-edge/grace band but outside the configured radius
- pinned: explicitly kept by the user and not removed by later category/radius changes

Selecting a POI from either the map or routebook highlights the corresponding item in the other view.

POI detail should show at minimum:
- name
- category
- route kilometre
- actual off-route distance
- normal / near-miss status where relevant
- pin / unpin action

## Routebook

The routebook is ordered by projected route kilometre, never by air-line distance or map position.

Each entry should be compact enough for scanning on a phone.

Pinned POIs remain visible even if their category is disabled or the configured radius is reduced below their distance.

## Warnings and route segments

Derived route states such as resupply gaps are not POIs.

The UI must support route-segment warnings as first-class objects.

For a resupply gap, show:
- warning severity
- start route kilometre
- end route kilometre
- gap length
- last qualifying resupply point before the gap
- next qualifying resupply point after the gap, if one exists

Critical gap segments should be visually distinguishable on the map and appear in the Warnings tab / routebook timeline.

## ICE

ICE means In Case of Emergency.

ICE is a temporary overlay/preset, not a permanent settings rewrite.

When activated:
- relevant search radii are widened temporarily
- emergency-relevant categories are emphasized
- existing user category settings remain unchanged underneath
- turning ICE off restores the normal view immediately

## Export

Export must be target-aware rather than one generic download button.

The UI should eventually offer target profiles such as:
- Garmin / FIT Course
- TCX-compatible device/app
- Universal GPX
- other device/provider profiles as compatibility is researched

If a target/import path is known not to preserve Bonkproof POIs, the UI must warn the user before export rather than silently dropping them.

## v0.1 UI scope

The first working screen only needs:
- local GPX load
- route statistics
- map with route
- start and finish markers

The bottom-sheet/sidebar shell may be prepared early, but POI, warning and export tabs can remain placeholders until their corresponding issues are implemented.
