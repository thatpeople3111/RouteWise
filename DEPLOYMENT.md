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
