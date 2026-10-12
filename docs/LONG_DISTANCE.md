# Long-distance planning

The backend selects LONG_DISTANCE at 100 km straight-line distance, 150 km road
distance, or at least 150 driving minutes with at least 75 km of displacement.
Traffic alone cannot change a city trip's scope. Stranded requests retain their
existing branch. Production scope detection reuses a direct road-route probe.

Optional roadway stops apply to Driving only. Local behavior and request fields
remain intact; response fields `tripScope` and `longDistance` are additive.

Coverage is configured, not global: Brightline's Florida stations, the Florida
portion of Amtrak's Floridian, a subset of Tri-Rail/SunRail stations, and selected
major US commercial passenger airports. Hub coordinates are maintained approximate
access points. Exact selected-place types are used when available so hotels near
an airport do not become airport destinations. Unknown hubs have no fabricated
rental-provider directory.

Rail routes are discovered from documented service corridors, not ticket
inventory. Only Brightline Miami–Orlando has a configured 210-minute ride-time
benchmark; other rail durations remain unavailable. Rail fares are unavailable.
The benchmark is not a verified departure schedule.

Flights are nearby-airport booking searches. No airline, flight number, direct
service, fare, or airborne duration is invented. A connected flight inventory API
can fill these fields later. Modeling allowances are 120 minutes before flying
and 30 minutes after, or 30 minutes before rail. Unknown durations prevent a
complete door-to-door comparison.

First/last-mile estimates use the existing road routing and rideshare services
for the specific hub leg. They use current/departure-time estimates, not live
dispatch or arrival-time availability. An exact arrival airport destination adds
no unnecessary last-mile ride. Rentals at MCO, TPA, and ATL come from official
airport directories; prices and vehicle inventory remain unavailable.

Vehicle expense uses the IRS business mileage allowance as an explicitly labeled
planning proxy, including fuel and vehicle costs: $0.725/mile January–June 2026
and $0.76/mile July–December 2026. It is not a fuel quote or a tax recommendation.
Other years remain unavailable until maintained. Tolls, parking, and stop
purchases are separate components counted once. A missing component makes total
cost unavailable; known subtotals are never called complete totals.

Rankings compare complete available durations and respect budget, vehicle access,
walking, optional-stop, and scheduling constraints. Missing fare data is never
treated as zero. Search-only flights are never ranked. Arrive-by rail/flight
departures need schedule confirmation.

Sources reviewed 2026-10-11:

- https://www.gobrightline.com/train-stations
- https://www.gobrightline.com/press-room/2023/brightline-unveils-orlando-passenger-rail-station
- https://www.amtrak.com/routes/floridian-train
- https://www.tri-rail.com/pages/view/system-map
- https://sunrail.com/maps-schedules/map/
- https://orlandomco.com/node/13
- https://www.tampaairport.com/ground-transportation
- https://www.atl.com/wp-content/uploads/2025/08/CAR-RENTAL-June-2025-Fiscal.pdf
- https://www.irs.gov/tax-professionals/standard-mileage-rates

No live flight, rail-ticket, or rental inventory API is currently configured.

Arrival transportation and pricing update (2026-10-11):

- Each Rail/Flight journey owns its arrival-hub rental list beside its last-mile rideshares. Driving never renders rentals. The legacy top-level rental list is retained for wire compatibility but no longer rendered.
- Verified MCO/TPA/ATL agency directories supply up to three providers; Brightline Orlando arrivals use the MCO directory and explicitly require pickup-access confirmation. Other station/airport directories remain unavailable.
- Central fareEstimation preserves the existing Lyft/Waymo distance/time assumptions. Modeled planning factors: weekday commute 1.15, late night 1.20, weekend 1.10, otherwise 1.00; low/high bands remain 0.85/1.20. These factors are uncalibrated product assumptions, not observed provider surge or validated market quotes.
- Selected timestamps are interpreted in modeled Eastern/Pacific US markets with Intl DST handling. Unsupported areas/unknown times use the baseline range. Rail last-mile time uses estimated elapsed journey time; flight searches without an arrival schedule use no guessed arrival time. Arrive-by times are only a pricing-time proxy, not confirmed hub pickup schedules.
- Uber retains unavailable pricing. No reliable full-corridor rail, airfare, or rental baseline is configured; no seasonal, advance-purchase, or rental-duration rates are fabricated. Existing official transit and parking references remain official and unchanged; there is no evidence for adding time multipliers to them.
- Shared formatDuration displays rounded durations as min below 60 and hr/min above it, omitting zero remainder minutes. Numeric inputs still accept minutes and show a formatted summary. Clock times and API numeric minutes are unchanged.

Provider statements support time/demand as factors, but do not publish the RouteWise numeric factors:
https://help.lyft.com/hc/en-us/all/articles/115012925707
https://support.google.com/waymo/answer/9059184?hl=en
