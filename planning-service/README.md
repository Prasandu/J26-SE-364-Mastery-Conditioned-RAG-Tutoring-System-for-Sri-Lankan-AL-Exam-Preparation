# Planning Service

Adaptive study planning and learning analytics service for J26-SE-364.

## Requirements

- Python 3.13
- PostgreSQL (the shared Supabase project, using the `planning` schema)

## Local setup

From this directory, create and activate a virtual environment, install the
development requirements, and configure the environment:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

Set `DATABASE_URL` to a PostgreSQL connection URL and fill in the JWT and
service API secrets in `.env`. Do not commit `.env`.

Apply migrations and start the service:

```powershell
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8083 --reload
```

`GET /health` reports service health without querying the database. Open
`/docs` locally to view the OpenAPI interface.

## Checks

```powershell
ruff format .
ruff check .
pytest
```

The database models and feature endpoints will be added in subsequent
development steps. The P1 model tables are created by the initial Alembic
migration. The migration enables the PostgreSQL `vector` extension for the
16-dimensional profile embeddings; ensure the Supabase project permits that
extension before applying it.

## Topic catalogue

Once the team agrees on the syllabus-derived topic catalogue, place it at
`../shared/contracts/topics.json`. The catalogue uses a `units` array, with
each unit containing nested `topics` and optional third-level `topics` arrays.
IDs must be unique and stable. Each topic may include a stable `code`,
`description`, `grade_level`,
`exam_weight` (0 to 1), and `prerequisites` (an array of topic IDs). The
seeder checks references and parent ordering before upserting:

```powershell
python -m scripts.seed_topics
```

To use a different file, run `python -m scripts.seed_topics --file path\to\topics.json`.
