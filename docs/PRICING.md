# Provider pricing

The active backend owns pricing/pricingService.ts. FareRequest reuses the existing Location type and carries provider, date/time, passengers, route facts, and provider context. FareEstimate holds numeric USD amounts, exact/range/from kind, source/confidence, retrieval time, links, and whether the amount applies to the complete requested trip. No credentials are sent to the frontend.

Audit of previous behavior:
- Lyft and Waymo used app-maintained distance/time assumptions in fareEstimation/ridesharePricing. These models remain the fallback; no random ranges or duplicate formulas were introduced.
- Uber exposed a booking link with unavailable price; no live pricing API exists.
- Brightline/Amtrak/Tri-Rail/SunRail journeys, flight searches, and arrival rentals had unavailable prices. Advertised starting fares must not become complete journey prices.
- Google Routes can return transitFare. The local transitFares service has maintained official agency base references, including a Tri-Rail reference; these are not full intercity quotes. Existing numeric fare/ranking behavior is preserved.
- parkingPricing maintains published facility rates for two garages. Rates do not establish parking duration or a total trip cost.
- Gemini ranked factual route candidates and did not generate prices. Ranking behavior remains separate from extraction.

Source order: injected LIVE_API adapter, OFFICIAL adapter/reference, public booking/fare page, Gemini extraction of the retrieved public text, existing provider-specific model, unavailable. References/starting fares do not prevent trying for a complete trip fare. A usable complete modeled fare takes precedence over an incomplete reference for trip costing. Unknown currencies or absent provider baselines remain unavailable. No live provider API credentials/agreements are configured; connecting one requires a documented official API adapter, not private endpoints.

Provider adapters are defined in pricing/providers.ts for Uber, Lyft, Waymo, Brightline, Amtrak, Tri-Rail, SunRail, flights, rental cars, parking, and local transit. Public source URLs come from backend provider context; retrieval uses allowlisted HTTPS provider domains, no authentication/cookies, no redirects or challenge retries, a four-second timeout, and a 250 KB body limit. Public pages are not booking inventory. The deterministic parser can read advertised starting fares. Complex fares fall through to Gemini when GEMINI_API_KEY is configured. Missing keys, protected/dynamic pages, unsupported currencies, and absent quotes are ordinary unavailable conditions. No live network pricing tests were run.

Gemini sees only retrieved public text, provider/route labels, and requested date/time. Its task is extraction, never guessing. Numeric amounts and USD evidence must appear verbatim in the source. From qualifiers cannot be promoted to exact fares. A complete trip fare additionally requires both route names and the requested ISO date in evidence; unverified multiple-passenger pricing stays reference-only. Rental evidence must identify the selected agency, and per-day units require explicit evidence. This deliberately rejects incomplete or ambiguous quotes.

The in-process cache lasts two minutes (15 seconds for unavailable), caps at 200 entries, coalesces concurrent identical requests, and keys the complete request including date/time/context. It is per server process, not shared between deployments. Development diagnostics log provider/source/result only, without keys, tokens, or locations. Adapters are bounded by timeouts and errors fall through.

Compatibility: optional fare metadata coexists with estimatedPriceLow/High, priceSource, estimatedTransportationCost, and parking price fields. Complete fares/range upper bounds can populate legacy rideshare/journey costs. FROM and reference-only prices never contribute to complete long-distance totals. Existing local transit numeric ranking inputs remain unchanged. Rental fares are alternative destination transportation, never added to a rideshare journey total. Legacy top-level rental listings are retained for wire compatibility; journey-specific rental cards consume fare metadata.

Backend-only environment controls:
- GEMINI_API_KEY / GEMINI_MODEL: existing Gemini configuration.
- ROUTEWISE_PUBLIC_PRICING_ENABLED=false: skip public retrieval/extraction. Public retrieval is otherwise enabled for supported source URLs.

Tests use mocked provider/public/Gemini responses, not fabricated production prices. Cases cover source priority, exact/range/model/unavailable, malformed extraction, evidence validation, failures, cache lifecycle, and legacy references.

## Provider adapter extension (2026-10-11)

- modelConfig/timeContext centralize provider assumptions and local weekday/time-band categories with DST support. Uber now has its own planning configuration, while existing Lyft and Waymo assumptions remain distinct. These are not provider tariffs or surge data. Waymo is priced only after the existing coverage check succeeds.
- Brightline public retrieval targets official offers pages (or an explicitly supplied allowlisted public fare page), followed by the existing evidence-validated Gemini extractor. Fallback long-haul ranges use the February 2025 operator report's full-fare benchmark of USD 84, with RouteWise low/high spread and weekend/peak assumptions. Only real configured South Florida/Orlando station pairs qualify; no train times are invented. Short-haul pairs remain unavailable without a usable public source.
- Amtrak retains station/date/route context and attempts its public official information/Gemini path. No sufficient route-specific typical-fare baseline was verified, so failure remains unavailable. Auto Train promotions are not used as Floridian fares.
- Tri-Rail uses configured station zones, adult passenger count, and America/New_York travel dates. Weekday table before 2026-10-01: 2.50/3.75/5/6.25/7.50/8.75. Current table: 3/4/6/7/8/10, from the SFRTA fare-change notice and approved 10%/whole-dollar change. Weekend and operator-listed holidays use the USD 5 day pass. Unknown stations/coordinates remain unavailable. Special event products and discounts are not guessed. Zone maps use the maintained corridor station IDs.
- SunRail uses official county zones: Osceola/Orange/Seminole/Volusia and adult one-way USD 2 plus USD 1 for each county boundary. A fare does not confirm service on a requested day; durations/schedules remain unverified.
- Rental models stay limited to real agencies in configured MCO/TPA/ATL hub directories (including Brightline's airport station). Hertz uses its Q2 2025 Americas RPD benchmark, with a location-specific historical monthly planner at ATL. Avis/Budget use the Q2 2026 group Americas RPD benchmark. Enterprise/Alamo/National have no verified company-specific retail baseline: broad ranges use that industry proxy and explicitly say so. Aggregate revenue per day is NOT a retail quote or inventory rate. Bands and weekend adjustments are uncalibrated RouteWise assumptions. Outputs are daily ranges, with optional duration totals in metadata, never added to rideshare journey totals. Unknown flight-arrival dates use a disclosed approximate travel-date proxy.
- Documented Amadeus OAuth and Flight Offers Search work without new dependencies. Missing credentials return unavailable. Query context preserves IATA airports, local departure date, requested time band (not before requested time), and adult passenger count. Only matching one-way USD offers are accepted. Carrier code, local departure/arrival strings, duration, stops, and offer ID are retained. Sandbox offers are labeled test data and never treated as complete trip quotes. Production offers require authorized production credentials. Arrive-by-only searches without a departure date remain unavailable rather than guessing a departure date. No flight estimator baseline exists, so no airfare is fabricated.
- Live offer fields appear on flight cards, but door-to-door rankings still exclude unverified flight itineraries. Actual flight schedules are never inferred from a price or airport-pair search.

Primary references reviewed:
- https://www.gobrightline.com/content/dam/brightline/pdfs/investor-relations/brightline-florida-february-2025-revenue-ridership-report.pdf
- https://www.gobrightline.com/offers
- https://www.tri-rail.com/pressreleases
- https://classifieds.mcclatchy.com/marketplace/miami/advert/-Notices_231437 (SFRTA-authored fare-change notice)
- https://sunrail.com/fares-passes/fares/
- https://www.hertz.com/us/en/location/unitedstates/georgia/collegepark/atlt11
- https://d18rn0p25nwr6d.cloudfront.net/CIK-0001657853/5569387e-2ff3-467f-a3f8-fc576188390f.pdf (Hertz filing)
- https://ir.avisbudgetgroup.com/news-releases/news-release-details/avis-budget-group-reports-second-quarter-2026-results
- https://github.com/amadeus4dev/developer-guides/blob/master/docs/API-Keys/authorization.md
- https://raw.githubusercontent.com/amadeus4dev/amadeus-open-api-specification/master/spec/json/FlightOffersSearch_v2_swagger_specification.json

The previous generic USD 5 local Tri-Rail fallback was removed because a weekday fare depends on station zones and travel date. Local trips without usable station metadata keep an unavailable fare; their route data stays usable. Deterministic long-distance/station pricing uses the new official table. Existing Google-returned fares and other maintained agency references remain unchanged. Rideshare models are restricted to the continental-US planning footprint when coordinates are supplied.

Live public checks on fixed station pairs: Brightline Miami/Orlando weekday and weekend requests fell back to MODELED (59-131 and 65-144 USD respectively); Amtrak Miami/Orlando and Tampa/Jacksonville remained UNAVAILABLE. No exact public fare was accepted. Flight API behavior was verified with mocked documented responses; no flight credentials are configured and no live flight-shopping request was made.

Dynamic public train fares now additionally require a verbatim local departure/arrival clock time within a two-hour requested window before they can apply to the trip. Gemini receives the derived local time context; it never supplies inferred train times. Off-window or clock-free public prices stay reference-only. Amtrak's successful public-price path and its wrong-time rejection were verified using mocked official-page evidence.

## Normalized pricing UI (2026-10-11)

FarePrice is the shared display for rideshare, rail, flight, rental, and parking fares. Normalized fares override compatibility numbers. A small legacy rideshare adapter only wraps existing finite USD values; it does not estimate new prices. Exact/range/from/daily/unavailable and optional per-card loading states share styling and source indicators. Provider logos and actions remain, with normalized booking URLs preferred when present. Transit headers also consume fare metadata.

Journey connections retain the selected rideshare fare. Cost components carry fare metadata, and sums use complete trip fare upper bounds plus aggregate low/high bounds, counting each leg once. Reference/starting/unknown prices never become zero-cost components. All-unknown totals show unavailable; partial totals display only known costs. Rental pricing remains an alternative and is not added to the rideshare total. Cheapest labels are withheld when compared price ranges overlap; Best/Fastest continue their existing time/constraint behavior. Numeric compatibility totals remain available for older clients.

Four new render/cost tests verify exact/range/daily/unavailable/loading displays, all three rideshare providers in normal/Stranded variants, normalized values overriding stale legacy amounts, retained rail/flight/rental cards, logos, partial totals, duration formatting, and overlapping-range ranking. No browser visual verification was performed.
