# RouteWise Supabase setup

Project: RouteWise (Free), reference tzzizkzqkysnjhncceqf.
Dashboard: https://supabase.com/dashboard/project/tzzizkzqkysnjhncceqf

## Completed

- Public project URL and publishable key added to ignored root .env.local. Existing maps/backend values preserved. No privileged keys or OAuth secrets added to app files.
- Email provider and new signup enabled; email confirmation required; minimum password length set to 12.
- Site URL is http://localhost:3000. Exact allowed app callback: http://localhost:3000/auth/callback.
- user_preferences created transactionally through the Dashboard SQL editor using the local migration's schema, grants, trigger and policies. Do not apply this initial migration again; CLI migration history has not been linked/reconciled.
- Hosted inspection confirms RLS enabled, three owner policies, no guest SELECT grant and no authenticated UPDATE grant on ownership. Live unauthenticated Data API read returns HTTP 401.
- Account > Profile now includes Save defaults, using the existing verified-owner preference service. Blank limits save NULL; zero is valid. Active trips remain unchanged; future drafts can use defaults.
- Existing auth/session/guest integration retained.

## Validation

164 existing tests passed. Auth/preference checks also passed after the final form adjustment (23 tests). Typecheck and lint of the edited components passed. Embedded PostgreSQL validation passed for the actual migration, constraints, grants, RLS, timestamps and account deletion cascade. Live guest entry to Trip Details passed after configuration.

## Pending live acceptance

Google OAuth credential setup, provider enablement and live login/session/preference save-and-reload verification are in progress. Apple remains disabled at the provider. Email signup/confirmation/login has not yet been exercised with a real user.

## Production follow-up

No production RouteWise domain was found in the local project documentation. Add the actual deployed app origin/callback to Supabase and Google, set the public environment values in the hosting project, and rebuild/redeploy. No deployment was requested/performed.

Custom SMTP is not configured. The Dashboard requires it for email template editing; the default sender is for limited testing. Configure a sender before normal external-user email signup. Keep SMTP and OAuth secrets only in their provider settings, never NEXT_PUBLIC variables.