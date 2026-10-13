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
python -m alembic upgrade head
python -m uvicorn app.main:app --host 127.0.0.1 --port 8083 --reload
```

On Windows, using `python -m` runs the installed package even if the
`alembic.exe` and `uvicorn.exe` script directory is not on `PATH`.
Alternatively, activate `.venv` first as shown above.

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
  seven days, refresh mastery from new evidence, regenerate predictions with
  XGBoost when available (otherwise use the labeled rule fallback), and
  generate the next seven days.

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

## Predictive engine (P8)

The optional XGBoost engine predicts the next normalized topic score and
probability that the topic is weak. `POST /api/v1/predictions/{student_id}`
uses the authenticated student's evidence and task outcomes, persists its
topic and overall predictions, and returns a confidence estimate plus the
largest per-topic factors. The `{student_id}` path must match the authenticated
student. If no trained model is registered or model loading/inference fails,
the service logs the issue and returns a labeled deterministic rule-based
estimate instead.

Keep datasets under `planning-service/data/` and models under
`planning-service/models/`; both paths are git-ignored. The trainer accepts:

- OULAD `studentAssessment.csv` and its matching `assessments.csv`.
- Topic evidence CSV with `student_id`, `topic_id`, `score`, `max_score`,
  `observed_at` (and optional `difficulty`).
- The JSONL assessment events written by `tools/mock_components.py`.
- Optional task CSV with `student_id`, `topic_id`, `start_at`, `duration_min`,
  and `status` (plus optional outcome fields).

OULAD has no chemistry topic IDs, so an OULAD module/presentation pair is used
as a coarse topic proxy; topic-specific synthetic or service data should be
used for chemistry deployment. The trainer makes next-event samples, groups
time splits by target timestamp to prevent temporal leakage, and reports
XGBoost MAE/RMSE against global-mean and last-score baselines, plus weak-topic
F1/AUC. AUC is `null` if the held-out set contains only one class.

```powershell
python -m pip install -r requirements.txt
python -m tools.mock_components --output-dir data/mock --seed 364
python -m app.ai.prediction.train --data-dir data --model-dir models --seed 364
```

The mock-data step is needed only when you do not already have OULAD CSVs or a
topic-evidence CSV. It uses the checked-in topic catalogue and does not require
a database or `.env`. `data/` is ignored by Git. Training with no supported
input data exits with an actionable message rather than a traceback.

Each training run writes immutable XGBoost JSON model files and metadata under
a versioned directory, then updates `models/latest`. No student-level training
or prediction data is sent to an external service.

## Hybrid Bi-LSTM (P9)

The service can optionally blend the XGBoost next-score estimate with a small
Bi-LSTM-style sequence model over each student's topic score history. The hybrid
path uses a deterministic stacked-score blend and remains behind the
`HYBRID_MODEL_ENABLED` flag so the service keeps working with the plain XGBoost
or rule-based fallback when the optional neural path is disabled.

```powershell
$env:HYBRID_MODEL_ENABLED = "true"
$env:HYBRID_MODEL_STACKING_WEIGHT = "0.35"
```

When enabled, the model compares the XGBoost score with the recent score history
and returns a blended estimate while preserving the same confidence and factor
outputs. The comparison table is provided by
`app/ai/prediction/hybrid.py` and reports baseline, XGBoost, Bi-LSTM, and
hybrid metrics for local evaluation runs.

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
