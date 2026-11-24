# Frontend

The frontend is a Vite, React, and TypeScript application. Its API client is the
only layer that should make requests to backend services.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Run locally

From this directory:

```sh
npm install
Copy-Item .env.example .env
npm run dev
```

Vite prints the local URL after startup. Set `VITE_API_URL` to the shared API
URL and `VITE_PLANNING_API_URL` to the planning service URL when they differ
from `http://127.0.0.1:8081` and `http://127.0.0.1:8083`, respectively. Set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable student sign-in.

The planning screens are available at `/planning/setup`, `/planning/plan`, and
`/planning/dashboard`. They use the planning-service API and require an
authenticated bearer token; planning routes prompt for Supabase email/password
sign-in when no session is available.

The planning setup uses the shared syllabus topic tree and validates future
exam dates, topic selection, session limits, and non-overlapping weekly
availability before submission. The plan screen supports calendar/list views,
task outcome updates, schedule regeneration, and a notice describing sessions
that were moved or added.

The planning dashboard uses Recharts for adherence, mastery, and grade
visualizations. It relies on the API's data-availability flags and shows
"Not enough data yet" instead of presenting fallback values as learner results.
The dated mastery line chart uses weekly snapshots calculated from assessment
evidence.

## Checks

```sh
npm run lint
npm test
npm run build
```

## Structure

- `src/api/` contains backend communication, shared API types, and resource
  modules.
- `src/features/` contains page-level features.
- `src/components/` contains reusable UI components, including loading and
  error states shared by planning screens.
- `src/hooks/` and `src/lib/` hold reusable React logic and plain helpers.
- `src/test/` contains test setup; `tests/` contains application tests.

Other feature pages remain starter placeholders until their API contracts are
agreed.
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
    attempts.ts     start, save an answer, upload a photo, submit
    review.ts       review queue, teacher decisions, agreement
    admin.ts        topics, generating a model paper, publishing
    practice.ts     practice papers a student makes (no key needed)
  features/         one folder per area of the app
    papers/         browse a paper and its questions
    attempt/        start, answer, photo upload, answer sheet upload,
                    marking progress, submit, see the result
    review/         teacher review queue and marker agreement
    generate/       admin: make a model paper, check it, publish it
    practice/       student: make a practice paper for themselves
  components/       small reusable pieces, no API calls inside
                    Layout, NavBar, Footer, Hero, Card, Button, Badge,
                    Steps (what is happening during a wait), Spinner, ErrorBox
  hooks/            reusable React logic (useApi, useElapsed)
  lib/              plain helpers, no React inside
tests/              Vitest + React Testing Library
```

Rules:

- A feature never calls `fetch`. It calls something in `api/`.
- `components/` take props and show things. They do not fetch.
- `lib/` has no React imports, so it is easy to unit test.
- `api/types.ts` must match `assessment-service/app/schemas/`. If the backend changes,
  change that file first.

## Waiting states

Anything the person waits for shows named stages and, where possible, a real count,
never a bare spinner:

- **marking** - a live bar of marking points decided, the stages being worked through,
  and the time so far. After 90 seconds it says the AI marker may be busy.
- **reading a photo** - the three steps the server takes, with a note on how long
  handwriting usually takes.

`components/Steps.tsx` holds both pieces. Reach for it whenever a new wait appears.

## Checks before committing

One command, works in cmd, PowerShell and bash:

```
npm run check
```

It runs ESLint, TypeScript, Vitest, the production build and `npm audit`, and stops at
the first failure. To run one on its own: `npm run lint`, `npx tsc -b`, `npm test`,
`npm run build`.

Note: `;` does not chain commands in cmd.exe. Use `npm run check`, or `&&` between
commands.
