# RouteWise — ShellHacks 2026

Student trip planning for FIU and Miami. The backend returns structured routes for a form, map, cards, and timeline.

The API lives in [`backend/`](backend/README.md). The frontend can live alongside it in `frontend/`.

**Ready locally:** demo trip planning, Best/Cheapest/Fastest cards, destination search, nearby places, typed frontend client, and interactive API docs.

**Implemented, awaiting credentials:** Google Routes, Google Places, Gemini route selection, and optional Gemini Maps-grounded place guidance. External calls have mocked contract tests; live credentials have not been used or verified.

Start on this Windows computer:

```powershell
cd backend
.\Start-RouteWise.ps1
```

Then open <http://localhost:3001/docs/>. Demo mode makes no external API calls.

Frontend teammate: start with [`backend/docs/FRONTEND.md`](backend/docs/FRONTEND.md).

Backend setup and API keys: [`backend/README.md`](backend/README.md).
