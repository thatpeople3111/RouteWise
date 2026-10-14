# Waymo handoff adapter

Inspection found `WAYMO_WEB_URL = https://waymo.com/waymo-one/` in `src/server/services/rideshareOptions.ts`, reused by the compatibility exports in `src/lib/rideshare.ts`. Available Waymo results have this landing URL; unavailable results omit it. `RideshareCard` already displays Open Waymo only on the available branch. `RideshareOptions` keeps unavailable Waymo last and the existing CSS provides its unavailable styling.

`src/server/services/waymoAvailability.ts` remains the source of service-area decisions, including coordinate zones, active/limited areas, approximate boundary confidence and unverifiable results. The new adapter consumes the existing option's availability; it does not recompute or expand coverage.

No verified public pickup/dropoff URL contract was found in the codebase or inspected Waymo public pages. [Waymo's rider flow](https://waymo.com/rides/) directs riders to the app and publishes a Download and ride link. `buildWaymoHandoff` therefore retains validated pickup/dropoff coordinates and labels internally, while returning `endpointsPreloaded: false` and `exactRepresentation: false`. Explicit rideshare points override the original trip endpoints. No coordinates, labels, keys, prices or ETAs are added to external URLs.

Recognized existing/provider URLs are used unchanged, including the published app-download link. Unverified schemes, hosts, paths or query parameters fall back to the official download page on Android/iPhone/iPad, or the rides page on desktop/unknown. All available results include the rides page as `webFallbackUrl`. Unavailable options return `enabled: false`, a reason, and no URL, even if a stale booking URL is supplied.

This stage exposes the adapter independently; shared rideshare UI wiring remains deferred. Pricing, rankings, logos, unavailable styling, service-area data, Uber/Lyft, and protected demo backend files are unchanged. A future verified endpoint-link contract can be implemented behind this adapter without changing its endpoint input architecture. Current allowlisted links are landing/download flows, not exact booking links.

## Manual verification before UI integration

On physical Android/iPhone devices, open the returned official download/provider link and verify the landing or app-store flow. Confirm no pickup/destination is claimed to be prefilled; enter them in the Waymo app. On desktop verify the rides page opens. Check an available and unavailable existing Waymo card: pricing/logo/ranking stay unchanged and unavailable cards have no Open Waymo action. Inspect the adapter's disabled result and retained endpoint metadata without booking a ride. Native app opening and rider access remain provider-controlled.
