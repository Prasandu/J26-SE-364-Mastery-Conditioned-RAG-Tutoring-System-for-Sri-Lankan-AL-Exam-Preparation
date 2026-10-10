# Frontend

React web app for the **Intelligent Assessment & Automated Evaluation** component
(J26-SE-364). It talks to `assessment-service` over HTTP and holds no data of its own.

## Run locally

Start the backend first:

```powershell
cd ..\assessment-service
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8001
```

Then in a second terminal:

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

Open http://localhost:5180

Port 5180 is fixed on purpose (`strictPort`). The backend only allows the origins listed
in its `CORS_ORIGINS` setting, so a drifting port would be blocked by the browser.

## Folder layout

One layer per job: `pages -> features -> api`.

```
src/
  main.tsx          entry point
  App.tsx           the route table only, no logic
  index.css         Tailwind import
  api/              the ONLY place that calls the backend
    client.ts       fetch wrapper: base URL, errors
    types.ts        types that match the backend schemas
    papers.ts       /papers, /health
  features/         one folder per area of the app
    papers/         browse a paper and its questions
    attempt/        answering a paper (next step)
    review/         teacher review (later step)
  components/       small reusable pieces, no API calls inside
  hooks/            reusable React logic (useApi)
  lib/              plain helpers, no React inside
tests/              Vitest + React Testing Library
```

Rules:

- A feature never calls `fetch`. It calls something in `api/`.
- `components/` take props and show things. They do not fetch.
- `lib/` has no React imports, so it is easy to unit test.
- `api/types.ts` must match `assessment-service/app/schemas/`. If the backend changes,
  change that file first.

## Checks before committing

```powershell
npm run lint     # ESLint, must be clean
npx tsc -b       # TypeScript, must be clean
npm test         # Vitest
npm run build    # must succeed
```
