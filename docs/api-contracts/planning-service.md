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
