# Uber handoff foundation

`buildUberHandoff` in `src/lib/uberHandoff.ts` is a pure, independently tested builder. Card wiring is deferred to the shared rideshare stage: existing Open Uber actions still use their supplied booking URLs. Pricing, logos, ranking, availability, Waymo and Stranded behavior are unchanged.

The builder uses Uber's documented [rider deep links](https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction): mobile platforms receive `https://m.uber.com/looking`; desktop/unknown receive `https://m.uber.com/`. Every result also includes a parameterized `webFallbackUrl` using the latter. Universal-link opening depends on the installed app and browser; callers must not assume native app availability.

`pickup` and `drop[0]` hold URL-encoded JSON location objects with latitude/longitude, optional label as `addressLine1`, and optional address as `addressLine2`. Coordinates control location; display text does not replace them. Explicit `rideshare.pickup`/`dropoff` take precedence, otherwise trip origin/final destination are used. No GPS request or `my_location` substitution occurs.

Only documented location fields are copied. No keys, credentials, product selection, fare, ETA, driver, vehicle or service-availability claims are sent. The link prepares the provider flow; it does not book a ride. Exact intermediate-stop integration is deferred: stops are returned as `unsupportedStops` and reduce `exactRepresentation`, rather than being silently lost. Google Place IDs are not sent to Uber.

## Manual testing before shared card integration

On a physical Android/iPhone device, tap a generated universal link from a test page with Uber installed; verify pickup/destination pins and names, then leave without booking. Confirm a selected remote pickup is retained rather than replaced by GPS. On Android, destination may appear after pickup confirmation. Repeat without Uber installed and test the explicit web fallback. On desktop, open the web URL and verify the ride endpoints after any provider login. Test coordinate-only points and special-character labels. Uber notes that Safari address-bar pasting and the iOS simulator do not exercise universal-link behavior reliably.
