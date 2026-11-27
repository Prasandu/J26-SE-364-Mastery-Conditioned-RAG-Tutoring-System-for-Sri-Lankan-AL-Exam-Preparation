# Mastery Conditioned RAG Tutoring System for Sri Lankan A/L Exam Preparation

SLIIT final year research project **J26-SE-364**. Supervisor: Ms. Suriyaa Kumari.

An A/L Chemistry tutoring system with four parts: students practise in a virtual lab,
answer real past papers and get them marked point by point, receive a study plan built
from what they have mastered, and get tutoring help when they are stuck. All four appear
in one web app, with one sign-in, on one shared database.

## Components

| Component | Folder | Service (port) | In the web app |
|---|---|---|---|
| 1. Intelligent Virtual Chemistry Lab | `apps/`, `packages/`, `content/` | `apps/api` (8000*) + its own 3D app `apps/web` (5174) | `/lab` (opens `apps/web`) |
| 2. Intelligent Assessment & Automated Evaluation | `assessment-service/` | 8001 | `/papers`, `/practice`, `/my-results`, `/review`, `/admin` |
| 3. Adaptive Study Planning | `planning-service/` | 8083 | `/planning` |
| 4. Cognitive Support & Tutoring | `chemistry-tutor/support-service/` | 8002 | `/tutor` |
| Integrated web app | `frontend/` | 5173 | everything above |

\* The lab's port is whatever `VITE_API_BASE_URL` in the root `.env` points at.

`chemistry-tutor/frontend/` is the tutor's original stand-alone UI; its pages now live in
`frontend/src/features/tutor/`. Each service has its own `README.md`; the lab's is
[apps/README.md](apps/README.md).

## One sign-in: Supabase Auth

Everyone signs in through Supabase Auth in `frontend/`. Every backend verifies the same
access token against the project's public signing keys (JWKS), so no service holds a
shared signing secret:

- **Planning** and **support** use the token's `sub` (the Supabase user id) as the student id.
- **Assessment** links the Supabase user to a `users` row (`users.supabase_user_id`), made as a
  student on first sign-in. Roles stay in assessment; it never links by email to an existing
  account. Make the first admin by signing in once, then running
  `python -m app.set_role --email you@school.lk --role admin` in `assessment-service/`.
- **The lab** still runs with its development learner; Supabase sign-in for the lab is the
  next step (its M1 scope excludes production authentication, see `CLAUDE.md`).

## One database: the shared Supabase project

All four services point at the same Supabase PostgreSQL database (session pooler). Each owns
its own tables, so they never collide:

| Component | Schema | Migrations | Migration history table |
|---|---|---|---|
| Virtual lab | `public` (`sessions`, `experiments`, `knowledge_chunks`, ...) | `supabase/migrations/*.sql` | Supabase CLI |
| Assessment | `public` (`users`, `papers`, `attempts`, `resource_chunks`, ...) | `assessment-service/migrations` | `public.alembic_version` |
| Planning | `planning` | `planning-service/migrations` | `planning.alembic_version` |
| Support | `support` | `chemistry-tutor/support-service/migrations` | `support.alembic_version` |

Use `postgresql+psycopg://...` for the Python services' `DATABASE_URL` (psycopg 3 is the
installed driver) and plain `postgresql://...` for the lab's `LAB_DATABASE_URL`.

## Running everything locally

1. Copy each `.env.example` to `.env` next to it and fill in the shared database URL, the
   Supabase URL, and the keys. Never commit a `.env`.
2. Create the tables (once per database):

   ```powershell
   cd assessment-service;                alembic upgrade head; cd ..
   cd planning-service;                  alembic upgrade head; cd ..
   cd chemistry-tutor/support-service;   alembic upgrade head; cd ../..
   # lab: apply supabase/migrations/*.sql (Supabase CLI or the SQL editor)
   ```

3. Start the services, each in its own terminal:

   ```powershell
   cd assessment-service;              uvicorn app.main:app --reload --port 8001
   cd planning-service;                uvicorn app.main:app --reload --port 8083
   cd chemistry-tutor/support-service; uvicorn app.main:app --reload --port 8002
   pnpm dev:api; pnpm dev:web          # the lab, from the repository root (apps/README.md)
   cd frontend; npm install; npm run dev   # http://localhost:5173
   ```

## Between components

- Endpoints one component offers to the others: [docs/api-contracts/](docs/api-contracts/).
- Assessment's read-only `/integration` API (key per component, header `X-Integration-Key`)
  accepts a student's Supabase user id.
- **Open:** planning's pull adapter (`planning-service/app/adapters/evidence_sources.py`) still
  calls `/api/v1/assessment-events` with `X-API-Key`, which assessment does not serve, and the
  two use different topic ids (`chem-u3-...` vs `U03_...`). Wiring it needs an agreed topic
  crosswalk between the planning and assessment owners.

## Rules that apply to everyone

- `.env` and API keys are never committed. Commit `.env.example` instead.
- Student answer scripts and anything with a student name or index number stay out of git.
- `main` stays working; merge through pull requests only.
