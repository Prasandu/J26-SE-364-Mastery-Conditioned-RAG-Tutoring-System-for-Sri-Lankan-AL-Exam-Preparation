# Planning Service API Contract

Base URL for local development: `http://127.0.0.1:8083`

All ingestion endpoints require the `X-API-Key` header. The key is configured
as `INGEST_API_KEY` in the planning service environment. These endpoints are
for trusted component-to-component ingestion; `student_id` identifies the
student whose evidence is being recorded.

## POST `/api/v1/events/assessment`

Accepts assessment evidence. A single event may report evidence for multiple
known topic IDs. Timestamps must be ISO 8601 values with a timezone.

Request:

```json
{
  "event_id": "assessment-2026-001",
  "student_id": "student-123",
  "occurred_at": "2026-10-12T09:00:00Z",
  "evidence": [
    {
      "topic_id": "chem-u3-mole-concept",
      "score": 7,
      "max_score": 10,
      "difficulty": 0.7,
      "confidence": 0.8
    }
  ]
}
```

`evidence` must contain 1-200 items. `difficulty` and optional `confidence`
are between 0 and 1. Scores must be non-negative and cannot exceed a positive
`max_score`. Extra fields are rejected.

## POST `/api/v1/events/module-completion`

Records a completed module against one known topic. If omitted, `score` and
`max_score` default to 1, `difficulty` defaults to 0.5, and `confidence` is
null.

Request:

```json
{
  "event_id": "module-completion-2026-001",
  "student_id": "student-123",
  "topic_id": "chem-u3-mole-concept",
  "completed_at": "2026-10-12T10:00:00Z"
}
```

## Success response

Both endpoints return **202 Accepted** after storing the raw event, its topic
evidence, and refreshed learner-topic summaries in one database transaction.

```json
{
  "event_id": "assessment-2026-001",
  "accepted": true,
  "duplicate": false,
  "evidence_count": 1
}
```

An exact repeat with the same `event_id` returns 202 with `duplicate: true`
and does not add evidence or recompute learner state. Reusing an event ID with
different content returns 409.

## Errors

| Status | Meaning |
| --- | --- |
| 401 | Missing or invalid `X-API-Key` |
| 409 | Event ID was already used for different event content |
| 422 | Invalid request, score constraints violated, or unknown `topic_id` |
| 503 | The ingestion key is not configured |

Validation errors use FastAPI's standard 422 response. Planning domain errors
use `{"detail": "..."}`.

## Pull adapter coordination

The optional planning-service pull adapter expects the assessment service to
provide `GET /api/v1/assessment-events`, optionally accepting a `since` query
parameter and returning either an event array or `{"events": [...]}`. Each
event uses the assessment request shape above. This is a proposed integration
shape for coordination; confirm it with the assessment-service owner before
enabling the pull adapter. Configure its base URL with
`ASSESSMENT_SERVICE_URL` and, when that API is protected, configure its key
with `ASSESSMENT_SERVICE_API_KEY`.

The pull adapter reports upstream network, response, and event-validation
failures as 502 errors; it does not silently accept malformed upstream data.

## Student study plans

Plan endpoints require a Supabase Auth bearer token. The authenticated JWT
subject is the student identity; clients cannot create or access plans for
another student by supplying a `student_id`.

### POST `/api/v1/plans`

Creates a manual or predicted plan. The exam date must be in the future.
Availability windows use weekday numbers where Monday is `0` and Sunday is
`6`, and use local wall-clock `HH:MM` values. Windows on the same weekday may
not overlap. Session lengths are limited to 15-180 minutes; daily caps are
limited to 15-600 minutes. Fixed commitments must have timezone-aware,
non-overlapping timestamps.

```json
{
  "mode": "manual",
  "exam_date": "2026-12-20",
  "target_grade": "A",
  "topics": ["chem-u3-mole-concept", "chem-u12-kc"],
  "availability_windows": [
    {"weekday": 1, "start_time": "16:00:00", "end_time": "18:00:00"},
    {"weekday": 5, "start_time": "09:00:00", "end_time": "11:00:00"}
  ],
  "max_session_minutes": 60,
  "max_daily_minutes": 180,
  "timezone": "Asia/Colombo",
  "preferred_times": ["16:00:00"],
  "fixed_commitments": [
    {
      "label": "Tuition",
      "start_at": "2026-10-13T18:00:00+05:30",
      "end_at": "2026-10-13T19:00:00+05:30"
    }
  ],
  "priorities": [
    {"topic_id": "chem-u3-mole-concept", "priority": 0.8}
  ]
}
```

Manual plans require at least one known topic and build priorities only from
those selected topics. Omitted manual topic priority values default to `0.5`.
Predicted plans use the authenticated student's stored mastery/weak-topic
state; an optional `topics` list filters that state. Predicted plans without
stored mastery data return 409. Client-provided priorities do not override
predicted priorities.

Returns **201 Created** with the plan ID, mode, exam date, target grade, and
stored constraints. Creation and subsequent constraint edits are recorded in
`replan_log`.

### GET `/api/v1/plans` and GET `/api/v1/plans/{plan_id}`

Lists the authenticated student's plans or returns one owned plan. A missing
or other student's plan returns 404.

### PUT `/api/v1/plans/{plan_id}`

Replaces the plan configuration using the same request shape as POST. Topic,
date, mode, availability, preference, timezone, fixed-commitment, and priority
constraints are validated again. Actual changes are recorded with before/after
values in `replan_log`.

### POST `/api/v1/plans/{plan_id}/generate`

Generates and persists a schedule for an owned plan. Availability weekday
windows are interpreted in the plan's IANA `timezone` (default
`Asia/Colombo`). Sessions do not overlap one another or fixed commitments,
respect the plan's session and daily limits, and end before the exam date.
Only replaceable future `planned` tasks inside the requested horizon are
replaced; historical and outcome-recorded tasks are retained.

```json
{"horizon_days": 14}
```

`horizon_days` is 1-56 and defaults to 14. The response contains the scheduled
tasks plus `infeasible`, `shortfall_minutes`, and `unscheduled_minutes`, so
clients can distinguish a complete plan from one constrained by availability.
No saved availability windows returns 422.

### POST `/api/v1/tasks/{task_id}/status`

Records an outcome for an owned, still-planned task. The `status` is required;
`actual_duration_min` is optional except that a partial task requires a
positive value. A completed task without actual minutes counts its planned
duration; a missed task counts zero. Optional `score_before` and `score_after`
must be supplied together and each must be between 0 and 1.

```json
{
  "status": "partial",
  "actual_duration_min": 25,
  "score_before": 0.45,
  "score_after": 0.6
}
```

Missed tasks schedule their full duration again; partial tasks schedule only
the remaining duration. The affected topic receives a temporary priority
boost, and generated replacement work links to the source task with
`replanned_from`. Infeasible remaining work is reported in the returned
schedule. Repeating an outcome update returns 409.

### POST `/api/v1/plans/{plan_id}/weekly-replan`

Reviews the previous seven days and generates the next seven days. The
response reports planned/completed minutes, adherence, average recorded score
change, count of created topic predictions, and the new schedule. Mastery is
refreshed from newly ingested evidence. Predictions use the registered XGBoost
models when available, with the same logged rule-based fallback as the
prediction endpoint. Predicted-mode plan priorities are refreshed, while
manual priorities are preserved. The action is written to `replan_log`.

## Dashboard and what-if estimate

### GET `/api/v1/dashboard`

Returns dashboard metrics for the authenticated learner. `has_exam_plan`,
`has_adherence_data`, `has_mastery_data`, and `has_prediction` indicate whether
each metric has an underlying source record. When no mastery state exists,
`mastery_trend` and `weak_topics` are empty arrays; consumers should display an
empty state rather than treat fallback score fields as observed results.
`mastery_trend` contains current per-topic mastery and stored trend signals.
`mastery_history` contains weekly mastery snapshots recomputed from assessment
evidence through each week; sparse evidence may result in no chartable trend.

### POST `/api/v1/whatif`

Accepts `extra_hours_per_week` and/or `mastery_gain` and returns projected
normalized score, grade, and target gap. The response is an estimate, and the
projected score is never below the current score. Clients should offer this
projection only when `has_prediction` is true.

## Predictive engine

### POST `/api/v1/predictions/{student_id}`

Requires a Supabase bearer token. The path student ID must equal the JWT
subject; predictions for another student return 404. No request body is
required. The service uses the learner's assessment evidence, stored mastery
state, and task outcomes. It returns one predicted normalized next score and
weak-topic probability per observed topic, plus an exam-weighted overall score
and grade (`A` >= 0.75, `B` >= 0.65, `C` >= 0.50, `S` >= 0.35, otherwise `F`).
If no exam weights are configured, the overall score is the mean of topic
predictions.

```json
{
  "student_id": "student-123",
  "model_version": "xgb-20261012T060000Z",
  "prediction_source": "xgboost",
  "overall_predicted_score": 0.71,
  "overall_predicted_grade": "B",
  "confidence": 0.63,
  "topics": [
    {
      "topic_id": "chem-u3-mole-concept",
      "predicted_score": 0.74,
      "weak_probability": 0.22,
      "confidence": 0.63,
      "contributing_factors": [
        {"feature": "last_score", "value": 0.7, "contribution": 0.08}
      ]
    }
  ]
}
```

The XGBoost regressor predicts the next normalized topic score and the
classifier predicts the probability that the next score is below 0.5. Factor
contributions are per-sample XGBoost contributions. If no versioned model is
available or inference fails, response `prediction_source` is
`rule-based`/`rule-based-fallback`, with `model_version` set to
`rule-based-fallback-v1`; planning remains available and the condition is
logged. Prediction rows are stored in `planning.predictions`.

Train locally with `python -m app.ai.prediction.train --data-dir data
--model-dir models --seed 364`. The trainer reads OULAD assessment CSVs,
synthetic assessment event JSONL, or the documented normalized topic-evidence
CSV format. Its time-aware chronological split reports MAE and RMSE against
global-mean and last-score baselines, and F1/AUC for weak topics. OULAD module
and presentation pairs are used only as coarse topic proxies because OULAD
does not provide chemistry topic IDs. Dataset and model files remain local
under git-ignored `planning-service/data/` and `planning-service/models/`.

Prediction errors:

| Status | Meaning |
| --- | --- |
| 401 | Missing or invalid bearer token |
| 404 | Requested student does not match the authenticated student |
| 422 | No assessment evidence exists for the student |

## Demo endpoints

The Postman-only demo endpoints are disabled unless `DEMO_MODE=true`. Every
demo request also requires the planning service's `X-API-Key` (`INGEST_API_KEY`);
they do not accept or require a student bearer token. Configure
`DEMO_STUDENT_IDS` as a comma-separated allow-list. Requests for students
outside that list return 403, and demo routes return 404 when demo mode is
disabled. The seeded demo IDs are Nimal
(`c75c747b-a322-4bd3-9d03-6a2d3c95d916`), Pasindu
(`614f0cf0-bd67-461d-9958-0bd24adbce04`), and Uvindu
(`06a92599-4296-4896-9a95-0272b932e517`).

### GET `/api/v1/demo/students/{student_id}/summary`

Returns mastery and trend for each observed topic (including each topic's
parent/sub-topic relationship), the five weakest topics and explanations,
rule-based or trained-model overall and per-topic predictions, target gap,
and exam countdown. It calls the existing prediction and dashboard services;
assessment evidence must exist before predictions can be calculated.

### POST `/api/v1/demo/students/{student_id}/plan`

Creates a predicted-mode plan and immediately generates its tasks. The
`weekly_availability` entries use Monday `0` through Sunday `6` and local
wall-clock times. `max_session_minutes` (default 60), `max_daily_minutes`
(default 180), `timezone` (default `Asia/Colombo`), and `horizon_days`
(default 14) are optional.

```json
{
  "exam_date": "2026-12-20",
  "target_grade": "A",
  "weekly_availability": [
    {"weekday": 1, "start_time": "16:00:00", "end_time": "18:00:00"},
    {"weekday": 5, "start_time": "09:00:00", "end_time": "11:00:00"}
  ],
  "max_session_minutes": 60,
  "horizon_days": 14
}
```

The response contains the created plan and generated schedule. Predicted-mode
plan creation requires stored mastery data, and schedule infeasibility and
unscheduled minutes are returned rather than hidden.

### POST `/api/v1/demo/tasks/{task_id}/status`

Accepts the normal task outcome body (`completed`, `partial`, or `missed`) and
returns the recorded outcome plus `replan_result`, which contains the tasks
moved/generated and why remaining minutes were rescheduled.

### POST `/api/v1/demo/students/{student_id}/replan`

Runs the existing weekly progress review and next-week schedule refresh for
the student's most recently updated plan. Returns its metrics, generated
schedule, moved tasks, and the replan reason.

### DELETE `/api/v1/demo/students/{student_id}`

Deletes only the selected student's rows from planning tables, including
evidence, events, mastery, predictions, plans, tasks, availability, and replan
logs. Shared curriculum topics are retained. The response reports deleted
row counts by table.

Demo endpoint errors:

| Status | Meaning |
| --- | --- |
| 401 | Missing or invalid `X-API-Key` |
| 403 | Student ID is not in `DEMO_STUDENT_IDS` |
| 404 | Demo mode is disabled, or the requested plan/task does not exist |
| 409 | Predicted plan creation requires stored mastery data, or task outcome conflicts |
| 422 | Missing assessment evidence or invalid request |

### Scheduling and outcome errors

| Status | Meaning |
| --- | --- |
| 401 | Missing or invalid bearer token |
| 404 | Plan/task does not exist or is not owned by the authenticated student |
| 409 | Task already has an outcome, or outcome duration conflicts with plan |
| 422 | Invalid outcome fields or plan has no saved availability windows |

### Plan errors

| Status | Meaning |
| --- | --- |
| 401 | Missing or invalid bearer token |
| 404 | Plan does not exist or is not owned by the authenticated student |
| 409 | Predicted mode requested but no stored mastery data is available |
| 422 | Invalid plan configuration or unknown topic ID |
