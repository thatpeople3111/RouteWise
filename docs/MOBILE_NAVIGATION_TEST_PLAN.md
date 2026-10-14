# Physical-device navigation test plan

## Access and recording

Use a physical Android phone with Chrome and a physical iPhone with Safari. Repeat Apple checks on an iPad, including Request Desktop Website. Record OS/browser/app versions, detected platform, scenario, generated URL, expected/actual endpoints and mode, fallback result and return-to-RouteWise behavior.

Run `npm run dev -- --hostname 0.0.0.0` on a trusted local network and open the machine's LAN address on the device. The development-only `/dev/navigation` page generates static San Francisco fixtures without keys, GPS or API calls. Click Generate device links; Android should classify as ANDROID, iPhone as IOS, iPad as IPADOS. Click actual links/buttons rather than pasting universal links into Safari's address bar. `/dev/navigation` returns not-found outside development and has no production menu entry.

For real planner, Places, and GPS tests, use an existing trusted HTTPS development setup. A phone's ordinary HTTP LAN address is not a secure context for geolocation; do not interpret that restriction as a RouteWise GPS failure. No deployment or account configuration is performed by this stage. Harness fixtures are routing test points, not verified businesses, parking access or service availability.

## Android Chrome

1. Driving: generate/open Driving. Expect Google Maps driving directions with Ferry Building origin and City Hall destination. A route preview is valid when the fixture origin differs from actual GPS.
2. Walking: expect the same endpoints with pedestrian mode.
3. Transit: expect transit mode. Google may choose different services; RouteWise's chosen transfer timeline stays unchanged in the real planner. For scheduled real trips, set the retained departure/arrival time manually in Maps.
4. Optional stop: expect the exact stored test point between origin and destination. Repeat in the real planner with selected coffee/gas/food and verify its business/pin, not a replacement search.
5. Parking: expect driving via optional stop to parking. Return to the planner and use Walking directions from parking; expect parking → original final destination in walking mode.
6. Overflow: fixture has five stops; mobile link includes three and reports two omitted. Full itinerary remains in RouteWise.
7. Uber: tap its test link with Uber installed; verify pickup/destination coordinates/names. Confirm the provider handles product/fare/availability, then leave without booking. Repeat with explicit web fallback and absent/disabled app. Android may show destination after confirming pickup.
8. Waymo: expect official landing/download flow. No pickup/dropoff prefill is claimed. In the real app, unavailable Waymo stays faded/last with no action; do not treat harness simulated availability as coverage.
9. Safe Place: in real Stranded results select Route Me Here. Expect walking from current/original Stranded point to selected Safe Place. Return to the still-open RouteWise tab: selection, inline route and original final destination remain.
10. Continuation: choose transit or walking, first without GPS refresh (Safe Place origin), then with explicit accurate GPS refresh (current position). Both target original destination. Deny GPS access and verify Safe Place fallback. Uber after continuation must use Safe Place/refreshed pickup, never old trip pickup. Waymo coverage can disable its action for the changed pair.
11. Recovery: block popup opening and use direct links. Clear Safe Place leg, go Back to destination, start a new trip, and exit Stranded: no stale continuation should remain.

## iPhone Safari / iPad Safari

1. Repeat Driving, Walking and Transit. Expect Apple Maps `d`, `w` and `r` directions respectively, with the same origin/final destination. Preview/confirmation before beginning navigation is acceptable.
2. Optional-stop/overflow links use compatibility two-endpoint directions. Expect an omission/simplification notice and preserved full RouteWise itinerary. Use Open web fallback to inspect the Google representation. Do not expect Apple to honor undocumented waypoint parameters.
3. Parking: Apple driving ends at the stored parking point. Return to RouteWise and launch the separate walking continuation to original destination.
4. Uber: tap a universal link from RouteWise/harness on a physical device. Verify the endpoints and use explicit Uber web fallback if app opening/install behavior differs. Do not book. Simulator/address-bar tests are not substitutes.
5. Waymo: verify official landing/download flow, retained ride endpoints in RouteWise, and no unsupported prefill claim.
6. Safe Place and Stranded continuation: repeat Android steps 9–11. Expect Apple walking to Safe Place, then Apple transit/walking to original destination. Check refreshed and denied GPS behavior, Uber pickup override, and Waymo unavailability.
7. iPad: repeat normal and desktop-website Safari modes. Both should classify IPADOS and select Apple Maps; Google web fallback remains available.

## Limits and pass criteria

Mocks verify classification/URL/data behavior, not installed-app association, app-store routing, browser popup policies, exact provider routing or actual coverage. iOS may suspend/evict tabs; returning to the still-open mounted tab retains local continuation, but full reload does not persist it. No automatic arrival detection is expected. Record these physical-device results before release; do not claim them from build/test success alone.

Pass only if modes/endpoints match the handoff, omissions are disclosed, original destination/plan stays intact, rideshares show provider actions rather than Start, unavailable Waymo cannot be opened, and direct fallback links remain usable. No secrets should appear in URLs.
