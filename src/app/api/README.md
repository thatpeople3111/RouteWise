# API work

Create `suggest-stops/route.ts` and `plan-trip/route.ts` when implementing the APIs.
Use the shared types in `@/lib/types`, and validate incoming JSON at runtime (TypeScript types do not validate requests).
Keep provider clients and secret environment variables in server-side code. Never import them into client components.
No live API endpoints have been implemented by this setup.
