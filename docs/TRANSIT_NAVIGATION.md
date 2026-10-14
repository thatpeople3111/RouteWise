# Transit Start handoff

The normal Start service continues to map transit explicitly to Google `travelmode=transit`, Apple compatibility `dirflg=r`, or Apple unified `mode=transit`. Full trip origin and final destination are retained, including first/last walking portions. Walking segments and transfers are not converted into provider waypoints or driving legs.

`TripInput` retains the user's requested departure/arrival timestamp. The planner passes that schedule through the existing navigation props into `NavigationHandoffRequest.requestedTiming`. It is copied and validated, separate from provider-estimated segment times. The current API adapter sets route/segment times to null, so those are not used as a substitute for the user's schedule.

The documented [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started) and [Apple unified Maps URLs](https://developer.apple.com/documentation/mapkit/unified-map-urls) do not specify parameters for requested departure/arrival times or exact bus/train segment identifiers. No undocumented parameters are emitted. Apple `start` is a navigation delay, not a requested transit departure time, and is not used for schedule preservation.

Provider results expose `transit.exactJourneyPreloaded: false` and `transit.requestedTimingPreloaded: false`. Existing `exactRepresentation` describes endpoint/order/mode coverage only, not exact transit lines, schedules, or geometry. RouteWise remains the selected plan: tabs, names, maps, fares, timelines, transfer data and walking grouping are unchanged.

Normal transit Start shows a subtle recalculation notice before opening Maps. After handoff, requested departure/arrival time remains visible in RouteWise with instructions to set it in Maps. No timing is invented when the trip has none. Rideshare and Stranded components are unchanged.

## Manual verification

On Android and iPhone, choose a transit journey with transfers and first/last walking segments. Click Start and confirm transit mode and full origin/destination in Maps. Return to RouteWise and verify the selected tab, exact journey, fare, maps, timeline and grouped walks remain intact. Repeat with departure and arrival scheduling: verify RouteWise displays the requested time, then set it manually in Maps. Confirm the recalculation notice appears for transit only and no exact bus/train selection is claimed.
