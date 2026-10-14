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
