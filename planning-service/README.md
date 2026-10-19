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

Set `DATABASE_URL` to a PostgreSQL connection URL and fill in the service API
secrets in `.env`. For Supabase authentication, set `SUPABASE_URL` to your
project URL or set `SUPABASE_JWKS_URL` to its signing-keys endpoint
(`https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`). The
service prefers JWKS verification; `SUPABASE_JWT_SECRET` is only used as the
legacy HS256 fallback when no JWKS URL is configured. Do not commit `.env`.

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

## Study timer

`POST /api/v1/tasks/{task_id}/timer/start|pause|resume|finish` run a
server-backed timer on a planned task (`idle → running ⇄ paused → finished`).
Elapsed time comes only from server timestamps (`started_at`, `paused_at`,
`paused_total_sec`) and is returned on every task as `timer_elapsed_sec`, so a
page refresh rebuilds the live display. A student has at most one running
timer (a partial unique index enforces it); starting or resuming another task
pauses the running one. `finish` stores the measured minutes (capped at the
planned duration) in `actual_duration_min`, ready for the done/partial/missed
outcome. Sessions longer than `TIMER_CONFIRM_MULTIPLIER` (3) × planned time,
or running past local midnight, return `requires_confirmation` and are saved
only when the student sends `confirmed_minutes`. Recording an outcome directly
closes any active timer.

## Notifications

`GET /api/v1/notifications` runs a sweep and returns at most three unread
alerts, newest first, with the total `unread_count` (NFR8). The frontend calls
it on load and every 60 seconds, so no background job is needed.

- **Reminder:** a planned session with an unused timer starts within
  `reminder_lead_minutes` (default 10).
- **Missed:** a session that is still untouched `MISSED_GRACE_MINUTES` (30)
  after it ends is marked missed and re-planned once per plan with the
  existing re-planner. The supportive alert says where the session moved, or
  offers **Find a new time** (calls `/plans/{id}/generate`) when nothing fit.
  Sessions overdue by more than 24 h are marked missed without an alert.
- One alert per event (`dedupe_key`, unique per student). Reminders are
  cleared once their session starts. During quiet hours (default 22:00–06:00
  in the plan's timezone) nothing new is created and missed processing waits.
- Re-planning keeps sessions whose timer has been used and blocks their time.

`POST /api/v1/notifications/{id}/read` marks one read;
`GET`/`PUT /api/v1/notifications/preferences` manage lead time, quiet hours
and the on/off switch. For a live demo, set `MISSED_GRACE_MINUTES=0.5` and a
1-minute reminder lead.

## Rolling-horizon planning

A plan has three layers. The **roadmap** forecasts hours per topic for every
week until the exam (expected-gain allocation, with projected mastery carried
forward week to week) and is stored in `planning.roadmap_weeks`. The
**committed window** holds detailed tasks for the next `WINDOW_DAYS` (14), or
`SHORT_HORIZON_DAYS` (7) when fewer than 21 days remain; windows are shortened
so the final `FINAL_WEEK_DAYS` always start a fresh, fixed window.
**Checkpoints** rebuild the roadmap and the next window when the window ends or
new assessment evidence arrives. All constants live in `app/services/weights.py`;
rolling state is kept on `plan.constraints["rolling"]`.

- `POST /api/v1/plans/{plan_id}/generate` — with no `horizon_days`, commits the
  rolling window and refreshes the roadmap.
- `GET /api/v1/plans/{plan_id}/roadmap` — roadmap weeks (`committed` or
  `forecast`, `learning` or `final_revision`), window dates, next checkpoint,
  `checkpoint_due`, deferred topics, and any pending target decision.
- `POST /api/v1/plans/{plan_id}/checkpoint` — runs a checkpoint when due (or
  with `{"force": true}`): measures last-week adherence, refreshes mastery,
  applies the overload rule, reports how the estimated range moved, and commits
  the next window.
- `POST /api/v1/plans/{plan_id}/target-choice` — `{"choice": "keep_target"}`
  restores deferred topics; `{"choice": "adjust_goal"}` lowers the target to the
  grade reachable at the current pace. The target never changes otherwise.

Overload rule: when weekly adherence is below `ADHERENCE_FLOOR` (0.6), the plan
is compressed to adherence + `COMPRESSION_HEADROOM` of its load, sessions are
shortened, and the lowest-gain topics are deferred whenever scaling down would
leave a kept topic under `COMPRESSION_MIN_TOPIC_HOURS` a week. The change is
recorded in `replan_log` with a student-friendly explanation. Missed tasks are
rescheduled within the current window, and final-week tasks use revision,
past-paper, error-review or recovery activities with no theory steps.

Each scheduled task persists a `reason_details` object (topic/sub-topic,
mastery, trend, decline alert, exam weight, days to exam, factor values, and
activity recommendation) and ordered `steps`. Practice steps include
question-bank IDs, prioritizing questions the student previously answered
incorrectly and then unattempted questions. New and low-mastery topics include
theory time; declining topics include a review step. The tasks API returns
these fields alongside the original reason string.

Plan and dashboard responses also include `student_name` and a structured
`coaching_message`. It addresses the learner by their verified Supabase
profile name (or email prefix fallback), gives a realistic estimate and focus
topics, and suggests a daily study pace bounded by their plan availability.

These endpoints require a Supabase Auth bearer token. Replanned tasks point to
their original task through `replanned_from`; replan actions are recorded in
`replan_log`. Run `alembic upgrade head` after updating to add the nullable
task outcome tracking and structured task explanation columns.

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

## Generated demo and training datasets

`scripts/demo_students.json` defines the three named demo personas, the
synthetic cohort size, seed, and fixed reference date. Generate the Component
2 assessment JSONL, Component 1 completion JSONL, per-student teacher
rankings, XGBoost-compatible topic-score history, and the Pasindu low/high
mark demo events with:

```powershell
python -m scripts.generate_datasets
python -m scripts.generate_datasets --seed 42
python -m scripts.generate_datasets --dry-run
```

The default writes only to the git-ignored `data/generated/` directory.
`--dry-run` prints per-file record counts without writing output. Synthetic
students use `S001`-style labels alongside deterministic UUIDs derived from
the seed; no synthetic names, emails, or index numbers are generated.
Assessment event IDs use a fixed UUID namespace, making replays idempotent. Results use only
assessable topic IDs from `../shared/contracts/topics.json`. That catalogue
does not currently contain standalone oxidation-number or balancing-reaction
IDs, so the Pasindu profile proxies these areas with its closest allowed
calculation/redox topics.

`training_scores.csv` is directly discoverable by the prediction trainer as
topic evidence (`score`, `max_score`, `observed_at`, and `difficulty`), with a
JSON `features` column retained for analysis. To train from these datasets,
use:

```powershell
python -m app.ai.prediction.train --data-dir data\generated --model-dir models --seed 364
```

Generated scores are simulated with hidden per-topic ability, paper
difficulty, and seeded noise. They are for repeatable demos and development,
not real-student evidence or evaluation.

## Load generated events through the API

Start planning-service on port 8083, configure `INGEST_API_KEY` in
`planning-service/.env`, and enable demo mode with the persona IDs in
`DEMO_STUDENT_IDS` if using `--reset`. Then load all generated students or
just named personas:

```powershell
python -m scripts.seed_demo --dry-run
python -m scripts.seed_demo
python -m scripts.seed_demo --students nimal,pasindu,uvindu --reset
```

The loader maps Component 2 paper results to the planning assessment endpoint
and Component 1 completion records to the module-completion endpoint. It
submits in batches, displays progress, retries transient network/server
failures, and reports accepted, duplicate, and rejected event counts. It
loads event payloads and validates them before contacting the API; `--dry-run`
stops without network requests. `--reset` deletes only the selected demo
persona rows via the demo deletion endpoint and then reloads their events.
`--batch-size`, `--retries`, `--data-dir`, `--config`, `--env-file`, and
`--base-url` can override defaults. `PLANNING_API_URL` also overrides the
default API URL.

The planning models and migration define student IDs as plain strings, not
foreign keys to `auth.users`. Validated persona UUIDs can therefore be
ingested without creating Supabase Auth users; referenced topic IDs still
must exist in `planning.topics`.

## Legacy synthetic assessment events

Generate 20 synthetic students with eight weekly papers each. Event payloads
and hidden per-student topic abilities are written separately:

```powershell
python -m tools.mock_components --output-dir data\mock
```

The default random seed is 364; pass `--seed` to generate a different
deterministic sample. Keep generated mock data out of version control.

## Evaluation and demo

The evaluation script compares the service's adaptive priority calculation
against an equal-allocation static timetable and a lowest-mark-first heuristic.
It runs a deterministic, synthetic cohort of 50 students through the production
scheduler and prints a Markdown results table:

```powershell
python -m scripts.evaluate --teacher-ranking data\teacher-ranking.csv --output data\table-2.md
```

The same command appends a second table comparing a fixed full-period plan
(the day-1 roadmap executed unchanged) with rolling re-planning (14/7-day and
fixed 7-day windows, plus a no-compression ablation). Simulated students have
true mastery that shifts and study capacity that changes on day 21 of 42. It
reports adherence, exam-weighted mastery gain, the paired gain difference
against the fixed plan, overdue high-priority topics per student, feasibility
violations and re-plans, with 95% confidence intervals.

The supplied teacher-ranking CSV may contain one row per topic with
`topic_id,rank`, or per-student rows with `student_id,topic_id,rank`; lower
rank means higher teacher priority. Per-student rankings are averaged by topic
for the priority-agreement metric. An optional `exam_weight` column accepts
values from 0 to 1 and defaults to 0.7. The table reports schedule feasibility
violations, simulated adherence, missed tasks in each strategy's
top-priority quartile, expected-score proxy MAE/RMSE, and Spearman priority
agreement with the teacher ranking. This is a reproducible synthetic
comparison, **not** a real-student study or a trained model evaluation.
"Feasibility violations" counts schedules that cannot fit all
requested study time plus any generated task that violates an availability,
session, daily-cap, overlap, or exam-deadline constraint. Missed high-priority
tasks are uncompleted scheduled tasks for topics in that student's
top-priority quartile. Include the synthetic-data caveat with any reported
results.

The API demo creates a plan, generates a schedule, marks its first task missed,
then displays the re-plan response and dashboard summary. Start the service,
apply migrations, and seed the topic catalogue first. Set a valid Supabase
student access token and comma-separated seeded topic IDs:

```powershell
$env:PLANNING_ACCESS_TOKEN = "<student-access-token>"
$env:PLANNING_DEMO_TOPIC_IDS = "topic-id-1,topic-id-2"
python -m scripts.demo
```

`PLANNING_API_URL` may be set to override the default
`http://127.0.0.1:8083`. The demo creates a real plan and records a missed task
for the authenticated student.

## Docker Compose

Copy `.env.example` to `.env`, configure the planning database and secrets,
then start the API from the repository root:

```powershell
Copy-Item planning-service\.env.example planning-service\.env
docker compose -f infra\docker-compose.yml up --build
```

The container applies Alembic migrations before starting the API on port 8083.
It connects to the configured PostgreSQL/Supabase database; the compose file
does not create a separate database.
