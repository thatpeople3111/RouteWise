# RouteWise â€” ShellHacks

A shared Next.js App Router project for two collaborators. The UI is still the default starter; travel APIs are not implemented yet.

## Run locally

Use Node.js 24 and npm. Open this folder in VS Code, then run:

```sh
npm ci
npm run dev
```

Visit http://localhost:3000. No API keys are needed for the starter.
When adding integrations, copy `.env.example` to `.env.local` and enter your own keys locally. Never paste keys into GitHub, chat, source code, or any `NEXT_PUBLIC_` variable. `.env.local` is ignored by Git.

## Shared structure

- `src/app/`: pages and layouts.
- `src/app/api/`: future backend route handlers.
- `src/components/`: reusable frontend components.
- `src/lib/types.ts`: one shared frontend/backend contract (starter proposal; agree on fields together).
- `src/data/demo.ts`: typed example request.
- `public/`: static assets.

Both sides import types with `import type { TripRequest, TripPlan } from "@/lib/types"`.
Types disappear at runtime: API handlers must validate incoming requests.

## Publish to GitHub (owner)

The configured remote is `https://github.com/thatpeople3111/shellhacks-2026.git`. GitHub authentication must be completed by you. Run:

```sh
gh auth login --hostname github.com --web
```

After signing in, from this project folder, create a private repository and push the shared baseline:

```sh
git switch main
gh repo create thatpeople3111/shellhacks-2026 --private
git push -u origin main
git push -u origin frontend
git push -u origin backend
```

If a repository already exists, do not create another. Instead use its actual URL:

```sh
git remote set-url origin https://github.com/thatpeople3111/shellhacks-2026.git
git push -u origin main
git push -u origin frontend
git push -u origin backend
```

If Git rejects the push because the remote already contains work, fetch and review it; do not force-push.
In the repository's Settings â†’ Collaborators, invite `coleberger`. They must accept the invitation.

## Roommate setup

After accepting the invitation:

```sh
git clone https://github.com/thatpeople3111/shellhacks-2026.git
cd shellhacks-2026
npm ci
git switch backend
npm run dev
```

Create their own `.env.local` from `.env.example` only when needed. Local secret files are intentionally not shared through Git.

## Working together

You use `frontend`; your roommate uses `backend`. Keep `main` as the shared working baseline. Coordinate changes to `src/lib/types.ts` before either person changes request/response fields.

Before starting work, on your own branch with a clean working tree:

```sh
git fetch origin
git merge origin/main
```

After finishing a change, review files with `git status` and `git diff`. Stage only intended files, then commit and push your branch. Open a pull request into `main` and have the other person review it. After merging, both people fetch and merge `origin/main` again. If conflicts occur, resolve them together rather than overwriting each other's changes.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
```

The build may need internet access to download the starter's Google fonts.
Next.js setup reference: https://nextjs.org/docs/app/getting-started/installation
