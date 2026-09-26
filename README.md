# RouteWise — ShellHacks 2026

One repository for both teammates: https://github.com/thatpeople3111/shellhacks-2026

The Next.js frontend lives at the repository root; the existing standalone API lives in `backend/`. Backend history is preserved. The frontend is still the default Next.js starter and is not wired to the API yet.

## First-time setup (both people)

Use Node.js 24. Clone once, then open the folder in VS Code:

```sh
git clone https://github.com/thatpeople3111/shellhacks-2026.git
cd shellhacks-2026
npm ci
npm run dev
```

Frontend: http://localhost:3000

In a second PowerShell terminal, start the existing backend in demo mode:

```powershell
cd backend
npx.cmd --yes pnpm@11.25.0 install --frozen-lockfile
npx.cmd --yes pnpm@11.25.0 dev
```

Follow `backend/README.md` for backend prerequisites and alternate start commands. Backend: http://localhost:3001; interactive docs: http://localhost:3001/docs/.
Demo mode does not require Google or Gemini keys.

## Shared files

- `src/app/`: Next.js pages and layouts.
- `src/components/`: reusable UI.
- `src/lib/types.ts`: frontend import location, re-exporting the actual backend contract.
- `backend/shared/contracts.ts`: single source of truth and runtime validation schemas.
- `src/data/demo.ts`: sample input matching that contract.
- `backend/client/routewise.ts`: typed API client.
- `backend/docs/FRONTEND.md`: integration and rendering requirements.

Use `import type { TripRequest, TripResponse } from "@/lib/types"` in frontend code.
Agree together before changing `backend/shared/contracts.ts`. Do not create incompatible duplicate request types.

## Branches and collaboration

`main` is the combined baseline. Use `frontend` for frontend work and `backend` for backend work. The original `codex/routewise-backend` branch remains intact.

After cloning, the frontend developer runs `git switch frontend`; coleberger runs `git switch backend`.
Before each work session, with a clean working tree:

```sh
git fetch origin
git merge origin/main
```

Review `git status` and `git diff`, stage only intended files, commit, and push your own branch. Open a pull request into `main` and ask the other person to review. After merging, both people fetch and merge `origin/main` again. Coordinate overlapping edits and never force-push over each other's work.

## Keys

Root `.env*` files and nested environment files are ignored; only empty `.env.example` templates are tracked. If needed, copy the root template to `.env.local` and the backend template to `backend/.env`, then fill values locally. Never commit real keys or share them in chat. Keep API_ACCESS_TOKEN and provider secrets on the server, never in NEXT_PUBLIC_ variables. No credentials are required for the starter/demo.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
```

Backend checks are separate; see `backend/README.md`. The frontend build downloads Google fonts and may need internet access.

GitHub access: coleberger already has collaborator access. If sign-in expires, run `gh auth login --hostname github.com --web` yourself; do not paste tokens into chat.

Next.js reference: https://nextjs.org/docs/app/getting-started/installation
