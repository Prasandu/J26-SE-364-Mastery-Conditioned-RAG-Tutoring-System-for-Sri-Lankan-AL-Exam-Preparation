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

## Ingest evidence

Set `INGEST_API_KEY` and send the same value in the `X-API-Key` header to:

- `POST /api/v1/events/assessment`
- `POST /api/v1/events/module-completion`

Unknown topic IDs return 422. Replaying an identical event ID is idempotent;
reusing an ID for different event data returns 409. See
[`../docs/api-contracts/planning-service.md`](../docs/api-contracts/planning-service.md)
for request and response examples.

The optional `ASSESSMENT_SERVICE_URL` enables `PullEvidenceSource`, which
expects the assessment-service read endpoint documented in the API contract.

## Study plans

Authenticated students can create and manage plans with:

- `POST /api/v1/plans` — create a manual or predicted plan.
- `GET /api/v1/plans` and `GET /api/v1/plans/{plan_id}` — list or retrieve owned plans.
- `PUT /api/v1/plans/{plan_id}` — replace a plan and audit any constraint changes.

These routes use the Supabase bearer token subject as the student identity.
Plan validation covers future exam dates, topic IDs, non-overlapping weekly
availability, bounded session lengths, and timezone-aware fixed commitments.
Plans use `Asia/Colombo` by default; set `timezone` to another IANA timezone
when availability is entered in a different local time zone.

## Scheduling and weekly review

- `POST /api/v1/plans/{plan_id}/generate` — materialize up to 56 days of
  schedule from recurring availability, commitments, priorities, session and
  daily limits. The response includes `infeasible`, `shortfall_minutes`, and
  per-topic `unscheduled_minutes` when all requested study time cannot fit.
- `POST /api/v1/tasks/{task_id}/status` — record a task as `completed`,
  `partial`, or `missed`, with optional actual minutes and paired before/after
  score values. Missed work is replanned in full; partial work is replanned
  only for its remaining minutes.
- `POST /api/v1/plans/{plan_id}/weekly-replan` — summarize the preceding
  seven days, refresh mastery from newly ingested evidence, create explicitly
  rule-based topic predictions, and generate the next seven days.

These endpoints require a Supabase Auth bearer token. Replanned tasks point to
their original task through `replanned_from`; replan actions are recorded in
`replan_log`. Run `alembic upgrade head` after updating to add the nullable
task outcome tracking columns.

## Mastery calculations

P3 mastery calculations are deterministic pure functions in
`app/services/mastery.py`; their tunable and normalized component weights live
in `app/services/weights.py`. Assessment evidence is difficulty-adjusted and
recency-weighted, while consistency and evidence coverage temper the mastery
estimate. Weak-topic scores also account for score trend, error rate, revision
staleness, exam importance, and reported confidence.

P4 priority, activity selection, and SM-2-style revision scheduling are pure
functions in `app/services/priority.py`. Priority explanations return the
component that most influences each score; activity selection handles new,
weak, improving, mastered, and repeatedly missed topics.

## Checks

```powershell
ruff format .
ruff check .
pytest
```

The initial Alembic migration creates the planning schema tables. The migration enables the PostgreSQL `vector` extension for the
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

## Synthetic assessment events

Generate 20 synthetic students with eight weekly papers each. Event payloads
and hidden per-student topic abilities are written separately:

```powershell
python -m tools.mock_components --output-dir data\mock
```

The default random seed is 364; pass `--seed` to generate a different
deterministic sample. Keep generated mock data out of version control.
