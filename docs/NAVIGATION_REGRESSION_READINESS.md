# Navigation regression readiness — October 14, 2026

Status: ready for physical-device and live-service acceptance testing. Automated regression checks pass; no deployment or merge was performed.

## Defects fixed in this review

Main Stranded walking/transit cards still used the historical origin after a Safe Place leg, even though the separate continuation panel and rideshare section used the Safe Place/current pickup. Main card Start now uses STRANDED_RESUME with validated continuation origin, selected Safe Place and original destination. The maps, timeline, pricing, ranks and historical trip endpoints remain unchanged. Non-recommended but physically valid cards receive the same continuation endpoints.

Start components now remount when navigation endpoint/context props change, including transit alternative selection. This prevents cached fallback URLs for a previous origin from lingering after a Safe Place/current-location update. Missing continuation data fails explicitly.

## Automated results

| Check | Result |
| --- | --- |
| Frontend test suite | 284 passed, 0 failed |
| Frontend TypeScript | Passed |
| Frontend lint | Passed |
| Frontend production build | Passed |
| Active standalone backend build (`routewise-backend`) | Passed |
| Active standalone backend tests | 44 passed, 0 failed |
| Protected demo backend | No edits; no build/test mutation run there |

The backend test runner initially failed before test execution because sandboxed `tsx` could not resolve the OS user (`uv_os_get_passwd` ENOMEM). The same authorized command passed outside the sandbox without source changes.

## Regression coverage

Normal: driving/walking/transit Start, selected transit alternative IDs, secondary cards, valid non-recommended routes, unavailable exclusion, exact selected optional-stop coordinates/Place IDs, multi-stop ordering, waypoint limits, parking driving endpoint and separate final walking destination.

Rideshare: Open Uber/Open Waymo/Open Lyft actions, no generic Start, original fare/logo/ranking rendering, unavailable Waymo ordering/class/no-action behavior, mobile universal/web selection, endpoint validation and trusted fallback links.

Stranded: Safe Place list and inline route isolation, synchronous Route Me Here launch, original destination preservation, local continuation on return, explicit GPS refresh/Safe Place fallback, main walking/transit card continuation, rideshare pickup override, original dropoff, Waymo coverage recheck, clearing and new-trip remount.

Platforms: Android/Client Hints, iPhone, iPad mobile and Mac-like desktop Safari, Windows/macOS/Linux desktop, unknown platform, SSR safety, missing/invalid coordinates, popup uncertainty, provider limitations, and URL trust policy.

Existing suites also cover planner setup/stop flow, pricing/fare handling, account/Supabase integration logic, saved preferences, current-location naming, factual ranking/Gemini fallback, non-recommended dropdown, long-distance first/last-mile/rental behavior, maps/geometry, Places filtering and backend API contracts. No backend/shared wire contract changes were made in this stage.

## Remaining acceptance work

Automated tests use fixtures/mocks and do not prove current live Google/Gemini/provider responses, real Supabase login/RLS enforcement, installed-app association, mobile tab retention or actual coverage. Follow `MOBILE_NAVIGATION_TEST_PLAN.md` on physical Android, iPhone and iPad before release.

Known intentional limits: Apple compatibility links omit intermediate stops; Google mobile-browser links pass at most three intermediate stops; transit apps may recalculate exact services and schedules must be set manually; parking requires a separate walking handoff; Waymo exact endpoint prefill is unsupported; continuation survives return to the same mounted tab but not a full reload/tab eviction. No automatic arrival detection exists.

## Files changed in this stage

- `src/lib/startNavigation.ts`
- `src/components/StrandedResults.tsx`
- `src/components/RouteCard.tsx`
- `src/components/TransitTabs.tsx`
- `tests/startNavigation.test.cjs`
- `docs/NAVIGATION_REGRESSION_READINESS.md`

Existing uncommitted work from earlier stages was preserved. Protected `routewise/backend` content was untouched.
