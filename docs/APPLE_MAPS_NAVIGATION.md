# Apple Maps navigation handoff

`src/lib/appleMapsNavigation.ts` adds a pure provider builder using the existing `NavigationHandoffRequest`. It does not change trip state, UI, platform detection, Google Maps behavior, or backend contracts.

## Formats and capability

The default compatibility link is `https://maps.apple.com/?saddr=LAT,LON&daddr=LAT,LON&dirflg=MODE`. Driving maps to `d`, walking to `w`, transit to `r`. This two-endpoint format does not preload intermediate stops. They are returned in original order as `unsupportedStops`, with a warning and `exactRepresentation: false`.

Apple's [unified Maps URL documentation](https://developer.apple.com/documentation/mapkit/unified-map-urls) describes newer `/directions` URLs with `source`, `destination`, `mode`, and repeated `waypoint` query parameters. Callers can explicitly request `{ format: 'UNIFIED' }` when support is known (iOS/iPadOS 18.4+). This format preserves intermediate points in supplied order and maps modes to `driving`, `walking`, or `transit`. Platform classification alone does not establish version support, so the builder does not automatically select it.

The links pass stored coordinates without geocoding. Directions do not document custom names attached to coordinate values; labels/addresses remain available in returned point/stop metadata. The builder does not invent coordinate-label syntax, add search parameters to directions, or send Google's Place IDs as Apple's Place IDs. `URLSearchParams` encodes every transmitted query value. There are no API keys or environment reads.

## Parking and continuation

For driving, an explicit `parkingLocation` takes precedence, otherwise the last PARKING stop is used. The handoff destination becomes that parking point. That lot is excluded from intermediate-stop metadata because it is represented as the endpoint. `finalDestination` always retains the original destination, and `continuation` describes parking → original destination with WALKING mode. A separate walking leg makes `exactRepresentation` false even if all driving waypoints can be encoded. Parking metadata does not redirect walking or transit trips.

A safe-place first leg must be WALKING and have `safePlaceFirstLeg`. It routes only to that safe place while retaining the original final destination in metadata. Resume uses the supplied continuation route endpoints normally.

All supplied trip points, including unsupported stops, are validated using the existing coordinate helper. Invalid modes or coordinates throw. Valid but unsupported itineraries still produce a usable endpoint link with explicit degradation metadata. `exactRepresentation` describes point/order/mode coverage, not identical geometry, schedules, fares, or availability in Apple Maps. RouteWise remains the source of the full itinerary.

## Manual verification

On iPhone and iPad Safari, generate and open compatibility links for driving, walking, and transit. Confirm origin/destination and travel-mode selection. Test a trip with optional stops and verify those stops are reported as unsupported in the returned metadata. Test parking and confirm Maps ends at the lot while metadata retains the final walking destination. Verify special-character names remain intact in metadata and do not alter URL parameters. On iOS/iPadOS 18.4+ also test unified links with several repeated waypoints in order, including transit, and confirm the device honors them. Check Safe Place and resume links separately. Opening a link may show a route preview requiring a user action to begin navigation.

No Start buttons or automatic provider launches are implemented in this stage.
