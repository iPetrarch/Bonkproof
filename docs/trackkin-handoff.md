# TrackKin handoff contract

Bonkproof and TrackKin remain independent applications. Bonkproof sends a versioned payload only after an explicit user action.

## Transport
The browser posts JSON to the configured TrackKin endpoint, currently `/trackkin/api/bonkproof-import.php`. No intermediate GPX download is required. The receiver is not yet present in TrackKin main; until it exists Bonkproof must fail without modifying the loaded route or existing GPX/TCX export.

## Schema
`bonkproof-trackkin-handoff/v1` contains the original GPX text, route metadata, a TrackKin-compatible `routebook` with only `name`, `route_distance_km` and `planned_break_minutes`, plus parallel `source_stops` metadata carrying stable POI/pass identity, coordinates, category and source identity. Pause duration is currently zero because Bonkproof does not yet edit planned pause duration.

## Multi-pass routes
A physical POI may have multiple route passes. Selected passes stay distinct through `source_id` and `pass_identity`; ordering follows route position. If two selected stops round to the same canonical route metre, Bonkproof rejects the handoff instead of silently merging or moving them.

## Required TrackKin receiver
The receiver should require TrackKin authorization, enforce body/GPX size limits, accept only documented schema versions, parse and validate GPX before persistence, bind the routebook atomically to the imported GPX/tour plan, explicitly validate or ignore Bonkproof metadata, and return `{"ok":true,"redirect_url":"..."}` on success.

## Privacy
Only the explicit handoff sends the original GPX and selected stop metadata to TrackKin. Production privacy information should describe that optional transfer once the receiver is activated.
