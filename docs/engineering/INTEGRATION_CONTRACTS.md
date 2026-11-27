# Cross-component integration contracts

_Status 2026-11-27. Labels: `[VERIFIED IN CURRENT CODE]`, `[TESTED]`, `[NOT VERIFIED]`, `[BLOCKED]`._

## C2 assessment → C3 planner: assessment evidence

### Current state - broken `[VERIFIED IN CURRENT CODE]`

| Aspect | Planner expects (consumer) | Assessment serves (producer) |
|---|---|---|
| Endpoint | `GET /api/v1/assessment-events?since=` - one feed for all students (`planning-service/app/adapters/evidence_sources.py:68`) | `GET /integration/students/{student_ref}/events?since=` - one student at a time (`assessment-service/app/api/integration.py:22,33`) |
| Service auth header | `X-API-Key` (`evidence_sources.py:59`) | `X-Integration-Key`, one key per component (`assessment-service/app/security.py:29`) |
| Student id | `student_id` = Supabase user id (`planning-service/app/schemas/events.py:32`) | `student_ref` = account email; a Supabase user id is now resolved to it for linked accounts (`app/services/integration.py` `resolve_student_ref`, `[TESTED]` in `tests/test_supabase_auth.py`) |
| Shape | `AssessmentEvent{event_id, student_id, paper_id?, occurred_at, evidence[{topic_id, question_id?, score, max_score, difficulty, confidence?}]}` (`events.py:11-36`) | `StudentEventsOut{student_ref, as_of, events[MasteryEventOut{attempt_id, paper_id, question_id, topic_codes[], point_code, point_type, marks, awarded, status, answer_mode, marked_at}]}` (`app/schemas/integration.py:49-71`) |
| Topic ids | planner taxonomy `chem-u3-mole-concept` (195 ids in `shared/contracts/topics.json`); ingestion rejects unknown topics (`event_ingestion.py:82-85`) | syllabus codes such as `U03_5` from the assessment's own topic table |
| Idempotency | `event_id`, required | none: no event id; a point is identified only by `(attempt_id, point_code)` |
| Finality | not distinguished | the feed selects `PointResult.status in DECIDED` (awarded / not awarded) with **no filter on marking method** (`app/services/mastery.py:44`), and `MarkingMethod.LLM` exists (`app/models/attempts.py:63`) - AI-judged points would flow into planning (see GRD-011) |

`PullEvidenceSource` is used only by its unit tests: no route, job or scheduler calls it, so
no assessment evidence reaches the planner today.

### Required contract (proposed, versioned) `[NOT VERIFIED]`

Producer: assessment. Consumer: planner. Both validate against one JSON Schema kept in
`shared/contracts/` (to be added: `assessment-criterion-finalized.v1.json`).

```json
{
  "schemaVersion": "1.0.0",
  "eventId": "uuid - stable per (attemptId, pointCode, sourceVersion)",
  "eventType": "assessment.criterion.finalized",
  "producer": "assessment-service",
  "subjectUserId": "Supabase user id (UUID) from users.supabase_user_id - never a client-supplied value",
  "topicId": "canonical id from the shared registry, e.g. chem-u3-mole-concept",
  "sourceTopicCode": "U03_5",
  "sourceEntityId": "attempt/<attemptId>/point/<pointCode>",
  "sourceVersion": 1,
  "status": "final",
  "evidenceClass": "deterministic | teacher_verified",
  "score": { "awarded": 2, "maximum": 3 },
  "occurredAt": "ISO-8601 with timezone (the attempt's marked_at)",
  "idempotencyKey": "attemptId:pointCode:sourceVersion",
  "supersedesEventId": null
}
```

Rules:

1. **Only finalized, non-generative marks are emitted.** `evidenceClass` is `deterministic`
   (rule/checker) or `teacher_verified`. Points decided by an AI judge, pending points and
   unreviewed points are never emitted (depends on GRD-011).
2. **Canonical topics by explicit mapping only.** A reviewed registry in `shared/contracts/`
   maps each assessment `topic_code` to one planner `topic_id`. A code missing from the
   registry is **not** emitted (it goes to a quarantine list for review) - no fuzzy or
   name-based matching. The registry needs sign-off from the C2 and C3 owners.
   **Implemented (mechanism, `[TESTED]`):** `shared/contracts/topic-registry.v1.json` +
   `planning-service/app/services/topic_registry.py` (`resolve()` → `Resolved` only for an
   approved alias, else `Quarantined(reason)`); 17 tests. No aliases yet (needs the
   assessment topic export and reviewer approval).
3. **Identity from the token chain, not the payload.** `subjectUserId` comes from the linked
   account; events for an unlinked local account are not emitted.
4. **Service-to-service auth.** The planner calls with its own `X-Integration-Key`
   (`INTEGRATION_KEY_COMPONENT3`); rename the planner setting/header to match, or move both
   to short-lived audience-scoped service tokens (M1, SEC-008).
5. **Idempotent and correctable.** The consumer stores `eventId`/`idempotencyKey` and ignores
   repeats; a teacher amendment is a new event with `sourceVersion + 1` and
   `supersedesEventId`, which replaces the earlier evidence rather than adding to it.
6. **A real feed endpoint.** Add `GET /integration/events?since=&cursor=` (all linked students,
   cursor-paginated) for the planner's pull, keeping the per-student routes for profiles.

### Producer implemented - `GET /integration/events` `[TESTED]`

`assessment-service/app/api/integration.py` + `app/services/integration.py`
`finalized_events()`, behind `X-Integration-Key`. Emits `assessment.criterion.finalized`
v1 (`app/schemas/integration.py` `FinalizedEventOut`): `event_id` = UUIDv5 of
`source_entity_id#source_version` (stable across reads), `subject_user_id` = the linked
Supabase id, `source_version` = 0 for a rule/checker decision, n for the n-th teacher
decision, `evidence_class` deterministic | teacher_verified, `source_topic_codes` (assessment
codes - the consumer maps them through `shared/contracts/topic-registry.v1.json`).
Selection: marked attempts, shared papers only (no practice papers), trusted methods only,
linked accounts only, `since` on marking or teacher review time. Deviation from the proposal
above: no `supersedesEventId` - assessment cannot always know an earlier version was ever
emitted, so consumers supersede by `source_entity_id` + highest `source_version`.
Tests: `tests/test_integration_events.py`, which runs on SQLite and on a disposable Postgres. Paging is a keyset (`after` = the previous page's `next_cursor`, plus `has_more`), and `assessed_at` carries the answer time. The machine-readable contract is `shared/contracts/assessment-criterion-finalized.v1.json`, and a parity test on each side checks it.

### Consumer implemented - planner `[TESTED]` (local; live `[BLOCKED]`)

Code: `planning-service/app/services/finalized_marks.py`, `app/adapters/assessment_feed.py`, ledger migration `0010_assessment_decisions`.

| Concern | Behaviour |
|---|---|
| Auth | Sends `X-Integration-Key` only, never a user token. No URL or key → 503 before any request. 401/403 are not retried. Redirects are not followed. |
| Bounds | 10 s per request (3 s connect). 3 attempts with backoff 0.5 s, then 1 s; `Retry-After` is capped at 30 s. |
| Identity | Student = the event's `subject_user_id`. A later version naming another student → rejected. |
| Idempotency | The ledger is keyed by `event_id`. A duplicate is a no-op; the same id with other content → `integration_rejections`. |
| Corrections | The highest `source_version` per point wins. The older version's evidence is removed and its row kept as `superseded`. A late older version → `stale`. A partial unique index enforces at most one applied version per point. |
| Topics | Approved registry aliases only. Any unmapped code quarantines the whole event (reason recorded; original codes kept). `POST …/quarantine/release` applies it after approval. |
| Legacy AI | An `evidence_class` outside deterministic / teacher_verified → `legacy_unverified`, never evidence. |
| Mastery / plans | Recomputed once per touched student/topic. A predicted plan whose topic moved ≥ 0.05 gets an early checkpoint (3-day throttle). Manual plans are untouched. |
| Batches | One transaction per page together with the cursor. A failure rolls back and the next run re-reads the page (with a 15-minute overlap). |

Triggers: service-only `POST /api/v1/integration/assessment/pull` (`X-API-Key` = planner `INGEST_API_KEY`), or `python -m scripts.pull_assessment_marks`. No scheduler is configured yet.

Remaining:

- The registry has no approved aliases, so real events are quarantined until the C2 and C3 owners approve mappings.
- The header and key naming is still per service (SEC-008).
- `PullEvidenceSource` in `adapters/evidence_sources.py` targets a producer endpoint that does not exist (`/api/v1/assessment-events`). It is superseded by `assessment_feed.py`; retire it with the C3 owner's agreement.

### Changes needed, by component

| Component | Change |
|---|---|
| shared | `shared/contracts/assessment-criterion-finalized.v1.json`, topic crosswalk registry + review status |
| C2 assessment | done (producer above) |
| C3 planner | done (consumer above); still needed: a scheduler that calls the pull |
| Tests | contract tests on both sides against the shared schema; replay/duplicate/supersede cases; unknown-topic quarantine |

## Service-to-service authentication (SEC-008) `[TESTED]`

One header everywhere: `X-Integration-Key`, carrying one key per calling component. A student's browser token is never a service credential. A wrong or missing key gets 401; no key configured gets 503. Keys must be at least 16 characters and are compared in constant time.

| Receiver | Route(s) | Accepted callers (env name at the receiver) |
|---|---|---|
| C2 assessment | `GET /integration/*` | `INTEGRATION_KEY_COMPONENT1/3/4` (the planner pulls with its key as `ASSESSMENT_SERVICE_API_KEY`) |
| C3 planner | `POST /api/v1/events/*` | `INTEGRATION_KEY_COMPONENT1/2/4`, or the operator's `INGEST_API_KEY` |
| C3 planner | `/api/v1/integration/assessment/*`, demo | operator only: `INGEST_API_KEY` (a component key gets 401) |
| C4 support | `POST /api/v1/practice/flagged-questions` | `INTEGRATION_KEY_COMPONENT2` (assessment) |

Transition: the planner still accepts the old `X-API-Key` header for one release. Tests: `planning-service/tests/test_service_auth.py`, `assessment-service/tests/test_route_guards.py`, `chemistry-tutor/support-service/tests/test_route_auth.py`.

Still open: short-lived, audience-scoped service tokens and request ids (next step after per-component keys). Recording the calling component on each planner `RawEvent`.

## C4 support ← other components: flagged questions

`POST /api/v1/practice/flagged-questions` accepts **any signed-in user's token** and does not
check `body.student_id` (`chemistry-tutor/support-service/app/api/practice.py`, by design for
"another component reporting on a student's behalf"). Any student can therefore create
mistake records for any other student. Required: a service credential (as for assessment's
`/integration`) and no end-user tokens on this route. `[VERIFIED IN CURRENT CODE]`
