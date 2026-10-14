# RouteWise production readiness

Final implementation validation completed locally. No deployment or merge was performed.
No protected demo backend files were changed. The active standalone backend was built
and tested; only its generated build output was produced.

## Status

“passing” below means the implementation checks passed at the stated scope, not that
hosted configuration has been verified. “failing” for Google/email means production
acceptance is incomplete because no Supabase project is configured locally; it does
not indicate a reproduced auth code defect.

```yaml
Guest experience: passing # live normal trip and refresh; automated full guest flows
Google authentication: failing # live acceptance blocked; mocked OAuth/callback tests pass
Email authentication: failing # live acceptance blocked; mocked signup/verification/login tests pass
Session persistence: passing # SDK configuration and mocked Google/email restoration; live reload pending
Preferences save: passing # repository tests; live hosted writes pending
Preferences load: passing # repository/provider tests; live hosted reads pending
Trip defaults: passing
Preference-aware presentation: passing
Other route options preserved: yes
Stranded Mode: passing # automated full guest flow; live GPS-dependent completion not verified
Long-distance: passing # automated route/results tests
Supabase RLS: WARNING # actual local PostgreSQL tests pass; deployed policies not verified
Secrets: safe # local source/environment/browser review; Vercel values not inspected
Production redirects: manual setup required
Frontend build: passing
Backend build: passing
Protected demo backend: untouched
```

## Evidence and limitations

- TypeScript and lint passed. Frontend production build and active standalone backend build passed.
- All 162 frontend/project tests and 44 active-backend tests passed. Actual embedded-PostgreSQL migration/RLS tests passed, including cross-user read/write denial, guests, missing user claims, immutable ownership/timestamps and constraints.
- Live guest UI: Home → Continue as Guest → public FIU/Miami Airport locations → constraints with car enabled → optional-stop skip → ranked results. Driving/transit/maps/prices/rideshares/Waymo-unavailable reasons were visible. Expanding non-recommended routes revealed walking and constrained transit alternatives. Refresh returned to Home without an account prompt. Guest Stranded entry is accessible; automated tests use synthetic coordinates to complete that flow without relying on private GPS.
- Existing tests cover optional stops, factual route ranking, transit, walking, driving, rideshare and Waymo, long-distance rail/flight/rental presentation, maps/fallback, pricing, alternative routes, and current-location naming. These are controlled tests, not live provider coverage in every market.
- Added repository matrix: four modes × three priorities × nullable/zero/nonzero walking and budget values (108 combinations). Added trip-default mode/priority/limit matrix; individual-trip overrides do not mutate saved account values. No preference row represents an unconfigured account. “No preference” is supported per trip; the saved schema requires a mode once a row exists. NULL saved limits preserve normal planner defaults rather than creating an unlimited trip.
- Google/email services, session events/restoration/logout, preference failures/retry/account-switch cancellation, slow-default overwrite prevention and safe guest fallback pass mocked tests. Live OAuth, real email delivery/verification, persisted browser reload and hosted preference read/write have not been certified. Preferences currently have a repository/provider save API, not a user-facing preference editor; this stage did not add one.
- No debug auth bypass or hardcoded production auth redirect was found. Browser public values are build-time configuration. Local account config is absent; there is no local Supabase environment cleanup to perform.
- The security review's three high-severity dependency entries (Next.js, sharp, source-map-js) remain a release risk. Resolve/reassess them with a separate dependency patch and compatibility checks before deployment. No broad dependency upgrade was made here.

## Remaining manual production setup

1. Resolve the dependency advisories documented in [ACCOUNT_SECURITY_REVIEW.md](ACCOUNT_SECURITY_REVIEW.md), then rerun checks.
2. In Vercel's Production environment, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_` only), and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Set `GOOGLE_MAPS_API_KEY` and `GEMINI_API_KEY` server-only for the existing API handlers. Preserve any additional provider configuration needed by your current pricing setup. Keep `NEXT_PUBLIC_API_BASE_URL` empty for bundled same-origin APIs, or use the intended public HTTPS backend; never production localhost. Apply values before building. Review Preview separately.
3. Set Supabase Site URL to `https://YOUR_APP_HOST`; allow exact `https://YOUR_APP_HOST/auth/callback`. Keep `http://localhost:3000/auth/callback` only if local auth is needed. Avoid broad production wildcard redirects.
4. Enable Google in Supabase and enter the Google client ID/secret in the dashboard only. Google Cloud Web client: authorize the actual app origins and `https://YOUR_PROJECT.supabase.co/auth/v1/callback`. Verify consent-screen publishing/test users and minimal identity scopes.
5. Enable email signup/login, confirm email-verification and password settings, and configure production SMTP/sender delivery. Prefer the default same-browser PKCE confirmation template unless cross-browser bearer confirmation is deliberately needed; the latter has the account-confusion risks in the security review. Verify rate limits and abuse controls.
6. Apply `supabase/migrations/20261014000000_create_user_preferences.sql` once, or reconcile migration history before CLI push. Verify deployed RLS, the three owner-only policies, column grants and no additional permissive policies/views. Test with two real user identities and a guest, not an admin key.
7. Restrict the Maps browser key by production website referrers and appropriate APIs. Keep server keys restricted appropriately. Redact auth codes/token hashes/headers in hosting logs. Never put privileged credentials in public variables; rotate any previously exposed key and remove old exposed build assets.
8. Before release, run Google and email acceptance on the intended HTTPS environment: signup/verification, login, refresh, saved preference read/write, trip defaults/override, all alternatives, logout and guest planning. Use the preferences service to create test rows while no editor exists. Repeat guest normal/Stranded/refresh and long-distance smoke checks there. Confirm callback `Referrer-Policy: no-referrer` is delivered.

References: [Supabase redirect guidance](https://supabase.com/docs/guides/auth/redirect-urls)
and [Vercel environment configuration](https://vercel.com/docs/environment-variables).
