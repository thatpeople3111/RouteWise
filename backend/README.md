# Backend reset: Guide 2, Step 1

The previous standalone Fastify backend has been removed. The replacement follows the roommate's guide inside the existing Next.js app.

Step 1 only prepares VS Code, PowerShell, Edge, Google AI Studio, Google Cloud Console, and GitHub. It does not introduce a server or new source files. Gemini installation is Step 3, keys are Steps 4–5, and new API files are Step 6.

Preserved unchanged:
- shared/contracts.ts: required by frontend types and runtime validation.
- client/routewise.ts: historical integration client, not used by the current mock flow.
- docs/FRONTEND.md and docs/demo-response.json: historical reference, not current API instructions.
- .gitignore: keeps environment files, dependencies, and build output out of Git.

A standalone documentation server now runs on port 3001. It preserves the backend reset and does not implement API handlers. The frontend currently uses its existing mock flow on port 3000.

## Step 2 on this computer

The repository is already cloned at C:\Users\RayWo\routewise. Do not clone another copy. The current branch is frontend; backend and main already exist. There are existing uncommitted frontend changes as well as this reset. Review and checkpoint these changes before switching branches. Then use git switch backend, coordinating the frontend/shared-contract changes with your teammate. Do not blindly repeat git checkout -b backend or discard local work.

For later Step 6, create src/lib/gemini.ts, src/lib/maps.ts, src/app/api/suggest-stops/route.ts, and src/app/api/plan-trip/route.ts. They are intentionally not created in Step 1. Coordinate the guide's proposed request/response shapes with the preserved contracts before connecting the frontend.

Use an ignored root .env.local for future server keys. Never expose server keys through NEXT_PUBLIC_ variables.

A local recovery copy of the removed backend source, including prior uncommitted changes, is stored under the Codex reset chat's work/active-backend-before-reset directory. Nothing has been committed or pushed by this reset.

## Local docs server

From C:\Users\RayWo\routewise\backend, run npm run dev (or npm start). Open http://localhost:3001/docs. The root URL redirects to /docs; /health reports documentation-server status. Node.js 22+ is required. There are no package dependencies or required environment variables, and the port is fixed at 3001 to keep the frontend separate. This server uses Node's built-in HTTP module, not Fastify. The planned Next.js API routes remain unimplemented.

