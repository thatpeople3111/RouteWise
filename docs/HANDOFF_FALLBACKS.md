# External handoff fallbacks

All navigation launch actions now use shared HTTPS URL validation and a shared synchronous opener. Empty, relative, executable, credential-bearing or malformed URLs never reach browser navigation. Failures leave RouteWise state intact and show an in-app message.

| Target | Primary | Recovery |
| --- | --- | --- |
| Android | Google universal Maps directions | Direct navigation link; Google's HTTPS handling provides browser fallback |
| iPhone/iPad | Apple Maps | Explicit Google Maps web fallback link |
| Desktop/unknown | Google Maps web | Direct HTTPS navigation link |
| Uber mobile | Uber universal HTTPS link | Explicit parameterized Uber web fallback |
| Uber desktop/unknown | Uber web | Ordinary provider landing if endpoints are unavailable |
| Waymo | Verified provider/download/landing flow | Official rides page; no endpoint-prefill claim |
| Lyft/legacy supplied action | Existing supplied HTTPS link | Ordinary provider landing if supplied URL is invalid |

Fallback links appear after a handoff attempt. They are normal anchors so users can open them directly even when programmatic opening is blocked. `window.open` with `noopener` may return null on success as well as blocking; the UI therefore says “If the app did not open…” rather than falsely claiming failure or trying to detect installation. Thrown browser opens produce a recovery message. No hidden timeout/app-launch probes or automatic redirects discard the RouteWise tab.

Omitted stops, mixed driving/walking legs and transit recalculation retain existing point/stop metadata and trigger concise simplification messaging. Full route cards and exact transit timelines stay in RouteWise. Missing navigation coordinates produce an error rather than fabricated directions. Invalid rideshare coordinates use the ordinary provider flow without prefill; existing pickup/dropoff descriptions remain visible. Unavailable providers still cannot open. Incomplete Safe Place continuation hides Start and offers clearing/reselection. Existing waypoint/Waymo limits are unchanged.

Manual checks: block popups and click each navigation/provider action, then use the displayed direct link. Test Apple → Google fallback, absent Uber app → web fallback, unknown/desktop platforms, waypoint overflow, transit transfers, parking walking continuation, unavailable Waymo and incomplete Safe Place data. Verify itinerary/selected destination persists and no provider booking happens automatically.
