# Google Maps handoff URL builder

`src/lib/googleMapsNavigation.ts` consumes the existing internal navigation handoff without modifying it or connecting to UI actions. It returns a public `https://www.google.com/maps/dir/?api=1` URL with `dir_action=navigate`, included/omitted stop metadata, warnings, and `exactRepresentation`.

Reference: [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).

- Modes map explicitly: DRIVING → driving, WALKING → walking, TRANSIT → transit. Unknown modes throw.
- Resolved coordinates are always the location query values. Available endpoint Place IDs provide establishment identification. Waypoint IDs are included only when every included waypoint has one, in the same order. Labels and addresses remain in returned stop metadata; unsupported custom coordinate-label syntax is not used.
- `URLSearchParams` encodes query values, including coordinates, separators, and Place IDs. No API key, environment variable, or network request is used.
- The default target permits three waypoints, covering mobile-browser fallback. `{ target: 'DESKTOP' }` permits nine. The platform detector does not determine whether the Maps app is installed, so mobile callers should retain the default.
- Normal-trip overflow selection prioritizes explicitly selected optional stops, then parking, then other stops. The selected subset is restored to original trip order. Omitted stops also retain their original order. No waypoint optimization is requested. Stranded selection behavior is unchanged.
- For NORMAL driving with parking, the URL ends at the lot, with optional stops as driving waypoints. `continuation` retains parking → final destination in WALKING mode. Google's URL has one travel mode, so a single driving URL must not claim to encode the pedestrian leg. `exactRepresentation` is false for a separate continuation. The full internal itinerary and final destination stay unchanged; Stranded behavior remains unchanged.
- Transit links conservatively omit intermediate stops and report them, preserving transit mode. Later integration can offer separate transit legs rather than rely on multi-stop support.
- A STRANDED_SAFE_PLACE_LEG walks to `safePlaceFirstLeg`; the original final destination remains in the request. Normal/resume links use the final destination and ordered stops.
- Destination-only URLs accept an omitted origin through a provider-specific input type; the provider-neutral internal model still requires origin. Google determines the relevant origin or prompts the user.
- If Place IDs would exceed Google's 2048-character URL limit, the builder omits IDs and retains coordinate-based routing, with a warning.

`exactRepresentation` means all intended points/order/mode for the requested leg were encoded. It does not promise identical geometry, transit services, prices, or that every Maps product honors waypoints. Google recomputes routes, and some products may ignore waypoints. `dir_action=navigate` may display a route preview depending on location and product support.

## Manual verification before UI integration

Generate sample URLs in a development scratch call and open them in desktop Maps and Android Chrome (with and without the Maps app). Verify driving/walking/transit selection, endpoint placement, optional-stop order, parking before destination, and destination-only location prompting. Check a four-stop mobile request against omission metadata, and a desktop request with nine stops. Verify the safe-place link ends at the safe place and a resume link ends at the original destination. Check named places via Place IDs and confirm no API key appears in the URL. No Start buttons exist in this stage.
