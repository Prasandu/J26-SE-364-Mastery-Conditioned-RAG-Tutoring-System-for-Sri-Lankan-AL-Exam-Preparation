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

Vite prints the local URL after startup. Set `VITE_API_URL` in `.env` to the
assessment service URL when it differs from `http://127.0.0.1:8081`.

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
- `src/components/` contains reusable UI components.
- `src/hooks/` and `src/lib/` hold reusable React logic and plain helpers.
- `src/test/` contains test setup; `tests/` contains application tests.

Feature pages are starter placeholders until their API contracts are agreed.
