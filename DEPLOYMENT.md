# Vercel deployment

The Next.js project serves both the UI and the existing backend handlers through
`/api/plan-trip`, `/api/suggest-stops`, and `/api/safe-wait`.
`GET /api/health` reports service availability.

Set these environment variables in Vercel before building:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: the website-restricted frontend Maps key.
- `GOOGLE_MAPS_API_KEY`: the server-side Routes/Places key.
- `GEMINI_API_KEY`: the server-side recommendation key.

Leave `NEXT_PUBLIC_API_BASE_URL` unset or empty to use same-origin API calls.
Never configure localhost for a public deployment. Add the production HTTPS
domain to the frontend key's allowed websites, retaining existing local entries.

No separate backend hosting or CORS setting is required for this deployment.
The original standalone backend remains usable independently.

Optional accounts also require `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the Vercel Production environment before
building. Use only the project URL and `sb_publishable_` key. Never put a service-role
key, Supabase secret key, or Google OAuth client secret in a public variable.
Missing account configuration keeps guest planning available but disables sign-in.

Configure Supabase Site URL to the actual production HTTPS origin and allow the
exact `https://YOUR_APP_HOST/auth/callback` redirect. The application derives this
callback from the current origin and returns to `/`; no localhost auth redirect is
hardcoded. Configure Preview separately if you need auth testing there, preferably
against a test Supabase project with explicit allowed preview hosts.

Google Cloud's OAuth redirect URI is the Supabase project callback,
`https://YOUR_PROJECT.supabase.co/auth/v1/callback`, not the RouteWise callback.
Google provider credentials belong in Supabase's dashboard. Enable the email
provider, confirm email/password/SMTP settings, and apply the preference migration
before testing saved defaults. See [the production-readiness report](docs/PRODUCTION_READINESS.md)
for validation limits and the remaining release checklist.
