# RouteWise

Frontend: C:/Users/RayWo/routewise, http://localhost:3000, npm run dev.
Active backend: C:/Users/RayWo/routewise-backend, http://localhost:4000, npm run dev.
The old backend/ folder and port 3001 serve historical documentation only; do not use them for API requests.

## Integration

Set NEXT_PUBLIC_API_BASE_URL=http://localhost:4000 in .env.local if overriding the default, then restart the frontend. CORS_ORIGINS on the backend defaults to http://localhost:3000.
The backend loads ../routewise/.env.local followed by its own .env; existing process environment values take precedence. Backend .env values override the first file. GOOGLE_MAPS_API_KEY powers Routes and Places; GEMINI_API_KEY powers ranking. Never put provider secrets in NEXT_PUBLIC_ variables.

The form validates locations, one schedule timestamp, transport choices and limits. Choosing a stop sends category and searchArea to POST /api/suggest-stops. The UI displays candidates, not the legacy stops field. Selected candidates are retained intact for POST /api/plan-trip. Skipping omits selectedStop and sends skip:true. Extra limits are sent only with a selected stop.

src/lib/api-types.ts mirrors the active backend wire contract. src/lib/api.ts validates responses and maps them into the existing UI view models in view-contracts.ts. Route durations already include the detour and must not be added twice. Missing cost/rating/detour information remains unknown. Gemini failures retain rules-based ranking and are disclosed in results.

No mock flow is enabled. Demo fixtures remain for isolated UI work only. Map.tsx is an empty placeholder; an interactive map has not been implemented.

## Checks

Frontend: npm run typecheck, npm run lint, npm run build, npm test.
Backend: npm run typecheck, npm test, npm run build.

Continue frontend Step 16 using these active contracts. Preserve the existing UI and do not reconnect the historical backend.
