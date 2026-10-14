# RouteWise optional-account integration review

## Product answer

Signing in partially reduces repetitive input. A returning user with a saved row gets
transportation, walking, budget and optimization defaults without losing trip overrides.
Comparable preferred alternatives receive a presentation bias; factual BEST remains
authoritative. Signing in alone does not create useful preferences: the current app has
no account-default editor or user-facing save action. A new user cannot complete that
product loop without another authorized caller using the existing preferences service.
That missing feature is postponed rather than disguised as complete.

## Problems found and disposition

1. The old apply-once guard treated every draft edit as a preference edit. An origin or
   time entered before a slow load discarded all saved defaults. Fixed with synchronous
   field tracking: only edited mode/priority/budget/walking fields are protected. Origin,
   destination, schedule and other choices remain intact. Explicitly disabling walking
   also protects its limit. Submission freezes defaults; new-trip reset permits one new
   application; saved account values are never modified by trip edits.
2. Profile showed no saved values or indication that account-default editing was absent.
   Added a compact read-only saved-default summary and an explicit statement that trip
   edits apply only to the trip and account defaults cannot yet be edited there. A missing
   row is shown as not configured. No save/editor feature was added.
3. An empty `full_name` prevented fallback to a valid `name`. Fixed the metadata fallback;
   rendering remains escaped text and never fetches an avatar URL. Apple names remain
   optional; private relay emails remain accepted without email-based authorization.
4. This local checkout has no Supabase environment configuration. Google/Apple buttons
   are disabled and email submission is disabled, while guest entry works. Live provider
   login, browser-persisted reload, remote preference writes and production dashboard
   settings cannot be certified from mocked tests. This is a configuration/acceptance gap,
   not a reproduced defect in the auth-service flow.
5. Three high-severity dependency entries from the prior npm audit (Next.js, sharp,
   source-map-js) remain unresolved. They need a focused dependency patch/compatibility
   review; this integration stage did not alter packages or factual routing.

## Results

The statuses below distinguish local availability from tested implementation. Google and
email are marked failing because the local end-to-end path is disabled by missing config;
their service/callback regression tests pass. Apple has the same live acceptance limit.
"working" for persistence refers to repository/session tests, not certified hosted state.

```yaml
Optional accounts: partial
Guest experience: preserved
Google: failing # unconfigured locally; mocked OAuth tests pass
Email/password: failing # unconfigured locally; mocked auth tests pass
Persistent sessions: working # supported SDK mechanism and restoration tests; live reload pending
Preferences persist: working # repository round trips and local PostgreSQL; hosted verification pending
Returning-user repetitive input: partially reduced # saved-row users benefit; no preference editor
Preferred mode prioritization: working
Alternative transport modes: preserved
Per-trip preference overrides: working
Route algorithm: unaffected
Stranded Mode: unaffected
Long-distance planning: unaffected
Security/RLS: WARNING # local RLS passes; hosted policies and dependency risks remain
Frontend build: passing
Backend build: passing
Protected demo backend: untouched
```

## Validation evidence

- Typecheck, lint, frontend production build and active standalone backend build passed.
- 164 project tests and 44 active-backend regression tests passed. Actual PostgreSQL RLS
  tests passed for own-row access, cross-user denial, guests, missing user claims,
  immutable ownership/timestamps and preference constraints.
- Auth tests cover Google, email and implemented Apple: triggers, shared PKCE callback,
  verification, session restoration/events/expiry, sign-out and failures. Provider tests
  cover no row, saves/updates, null versus undefined, ownership, account switches, safe
  failure and retry. Token refresh/unrelated rendering does not reload preferences; explicit
  retry or identity lifecycle changes do. No polling or guest database writes were found.
- New tests cover slow defaults after location entry, independent field overrides,
  explicit no-mode and no-walking choices, submission freezing, saved-default profile
  clarity, and blank-name fallback. Existing mode/priority/nullable-limit matrix remains.
- Presentation tests verify the input plan is unchanged, BEST/FASTEST/CHEAPEST labels are
  not fabricated, unavailable/constrained/inferior modes are not promoted, and alternative
  visibility/Waymo ordering are retained. Requests exclude account IDs, email and sessions.
  Auth does not supply route duration, fare, geometry, provider availability or transit data.
- Stranded Mode has no auth/preference dependency or initialization gate. It retains its
  emergency-specific inputs/results rather than forcing account constraints. Long-distance
  presentation retains its independent existing logic.
- Guest account menu was checked in the browser at desktop and 390px width: dark styling,
  no horizontal overflow, guest action enabled despite unconfigured auth, and dismissal
  entering the normal planner. Signed-in profile/save-state checks used rendered mocks;
  no live signed-in browser fixture was available. Existing controlled tests exercise full
  normal/Stranded guest flows and routing regressions.
- Secret-bearing environment files and `.p8` files are ignored. Only `.env.example` is
  tracked with empty credential fields. No privileged Supabase key/variable matches were
  found in built browser assets. RLS authorization uses `auth.uid()`, not UI-selected IDs;
  repository identity uses verified `getUser()`. No migration change was necessary.

NULL saved limits deliberately preserve existing trip defaults (15 walking minutes/$25)
rather than introduce unlimited trips. Supported trip maxima still cap oversized saved
limits with a notice. Driving preference does not assert car ownership. A saved row needs
a mode; no row means unconfigured, while per-trip "No preference" is supported.

## Manual configuration and postponed work

Verify the production Supabase project URL/publishable key in the appropriate environment;
apply the preference migration and inspect deployed owner-only RLS/grants. Configure exact
production `/auth/callback` redirects and Site URL, Google provider credentials/consent,
email confirmation/password/SMTP/rate limits, and Apple Services ID/signing secret/renewal
if enabled. Provider secrets remain only in Supabase. See [SUPABASE.md](SUPABASE.md),
[APPLE_AUTH.md](APPLE_AUTH.md), and [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).
Retest live Google/email/Apple refresh, preference round trips with two users, and logout
on the intended HTTPS host. Resolve the dependency advisories before release.

Postpone a full preference editor/explicit save flow to a dedicated implementation with
validated optional limits, dirty state, failure handling and clear per-trip/account scope.
Do not rush saved places, cross-provider account merging, Apple-specific profiles,
emergency preference rules or factual ranking changes into this review.

Changed files: `src/lib/tripPreferenceDefaults.ts`, `src/app/page.tsx`,
`src/components/AccountMenu.tsx`, `src/app/globals.css`, `tests/tripFlow.test.cjs`,
`tests/transitOptions.test.cjs`, `tests/supabase.test.cjs`, `docs/SUPABASE.md`, and this report.
No protected demo backend source was changed; active backend build output was generated
only as part of requested validation. No deployment or merge was performed.
