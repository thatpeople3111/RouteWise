# Internal navigation handoff

This stage adds `src/lib/navigationHandoff.ts` without connecting it to UI actions or providers.

## Inspected sources

- `src/lib/view-contracts.ts` and `types.ts`: UI `RouteOption` has mode, geometry, steps, parking, optional-stop inclusion and transit alternatives. Its destination is nullable and it has no origin field.
- `src/lib/api-types.ts`, `src/server/types/index.ts`, and `src/lib/api.ts`: wire routes have origin/destination `Location` values and optional `originCoordinates`. The UI adapter currently drops these resolved endpoints and the plan's selected stop. Address/Place ID locations alone do not supply coordinates.
- `src/lib/tripDraft.ts` and `TripDetailsScreen.tsx`: `SelectedTripPlace` retains coordinates, Place ID, name and formatted address. Browser location lives in `originCoordinates`; `originText` retains the current-location display name.
- `src/lib/currentLocation.ts`: naming is separate from coordinate routing. Callers can supply the already displayed name as `NavigationPoint.label`; the handoff builder never invokes naming or geocoding.
- `src/components/Map.tsx`: draws route/step polylines and resolves map markers independently. The handoff does not decode geometry or change marker behavior.
- Optional stops retain their real `SuggestedPlaceCandidate` under UI `SuggestedStop.candidate`; wire selected stops use either `coordinates` or legacy `location`. Parking locations retain coordinates, Place ID, name, address and a recommendation flag.
- Transit alternatives own IDs, steps and geometry. Transit segment departure/arrival stops are names, not resolved coordinate points. Later callers can pass the selected alternative's ID/mode through the selected route; segment names must not be treated as coordinates.
- `StrandedMode.tsx`, `StrandedResults.tsx`, `SafePlaceRoutes.tsx`, and `src/lib/safePlaceRoute.ts`: the original destination selection and independent safe-place walking route are separate. Safe-wait candidates retain place metadata and nullable coordinates.
- Rideshare options contain origin/destination strings, not structured coordinates. Supply retained resolved pickup/dropoff points; the builder never parses those strings or booking URLs.
- `src/lib/longDistance.ts` and `src/server/types/longDistance.ts`: journey hubs have names and coordinates; first/last-mile connections have string endpoints and rideshare options. A later caller can adapt a resolved hub using `toNavigationPoint` and supply it for the individual leg. Flight/rail journeys are not themselves driving or public-transit road handoffs.

## Builder contract

`buildNavigationHandoffFromRoute` accepts an existing UI or wire route plus retained resolved endpoints when needed. Explicit endpoints take precedence. Missing/invalid coordinates throw; there are no network calls, provider URLs, or geometry-derived guesses. Only coordinate and location metadata fields are copied.

`optionalStops` contains only stops included in the selected route, in trip order. An explicitly selected parking lot wins over the route's recommended lot. No arbitrary lot is chosen. Driving parking is appended after optional stops; the final destination remains separate. `parkingLocation` describes that same appended point, not another visit.

Contexts are `NORMAL`, `STRANDED`, `STRANDED_SAFE_PLACE_LEG`, and `STRANDED_RESUME`. Safe-place and resume contexts require a selected safe place. `destination` always retains the original final destination. `navigationLegPoints` returns only origin → safe place for the temporary walking leg; otherwise it returns origin → ordered stops → destination. For resume, supply the continuation route and its actual origin (for example, the selected safe place). No original trip state is mutated.

`rideshare.pickup` and `rideshare.dropoff` are independent optional resolved points and do not rewrite trip endpoints. Cycling is explicitly unsupported by this new handoff model; existing cycling behavior is unchanged.

Normal driving with parking additionally includes `parkingContinuation` (parking → original destination, WALKING). The ordered itinerary still contains optional stops, then parking, then the original destination. The normal Start service accepts an ordered `optionalStops` array for callers with multiple selections; the current planner continues to supply its single selected stop. Every selection reuses its retained coordinates/Place ID.

After Start, RouteWise consumes provider omission metadata and displays “Some RouteWise stops could not be preloaded into this navigation app.” only when stops were omitted. If stops were omitted or a parking continuation exists, it displays the full retained itinerary. Parking continuations have a separate “Walking directions from parking” action using the same platform/provider services. Maps opens separately so the original plan remains available. Transit selection changes reset the associated handoff message.

## Validation

Tests cover driving, walking, transit, ordered optional stops, parking, safe-place isolation, resume, rideshare endpoints, wire endpoint reuse, coordinate validation and metadata filtering. No new manual UI testing is required for this unconnected layer. Provider opening, UI integration, live trips and first/last-mile provider behavior require testing in their later stages.
