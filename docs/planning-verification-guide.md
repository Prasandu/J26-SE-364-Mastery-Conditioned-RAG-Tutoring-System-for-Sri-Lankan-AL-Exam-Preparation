# Component 3 – "Show Me the Code" Guide
## Input → Process → Output → Deterministic verification

**Use this when the panel says: "Stop the demo. Show us the code and prove the output is correct."**

The panel's rule: *do not say "I checked the output manually myself".* The answer is that **the output is verified by code**, in four ways:

1. **Validation** – bad input is rejected before it is used (Pydantic schemas, database constraints).
2. **Determinism** – the planning logic is made of pure functions. Same input + same fixed clock = exactly the same output, every run.
3. **Automated tests with exact expected values** – 315 backend tests assert the results (run them live in 1 minute).
4. **Invariant checks** – rules that must always hold (no session outside availability, hours never negative, status agrees with the range) are checked over hundreds of random inputs.

> One-sentence answer to memorise:
> **"Every output comes from a pure function with a fixed clock. The same input always gives the same output, and the pytest suite asserts those exact outputs and the rules that must always hold, so I can re-run the verification in front of you."**

---

## 0. The five-minute rescue (if the demo breaks)

Open a terminal in `planning-service/` and run these. All are real files in the repo.

```bash
# 1. Prove the whole backend is verified (315 tests)
pytest -q

# 2. Prove one stage at a time (pick the one the panel asks about)
pytest tests/test_mastery.py -v          # mastery maths
pytest tests/test_achievability.py -v    # hours, grades, ranges
pytest tests/test_scheduler.py -v        # timetable rules (incl. 200 random cases)
pytest tests/test_rolling.py -v          # roadmap, checkpoints, final week
pytest tests/test_events.py -v           # input validation and idempotency
pytest tests/test_plans.py -v            # plan creation end to end
```

Then open the file for that stage (table in section 6) and walk top to bottom.

---

## 1. INPUT – what goes in and how it is checked

### 1.1 Where inputs come from

| Input | Source | Entry point | Code |
|---|---|---|---|
| Past marks (assessment events) | Teammates' assessment service or the seed script | `POST /api/v1/events/assessments` | `app/api/events.py` → `app/services/event_ingestion.py` (`ingest_assessment_event`) |
| Module completions | Teammates' module service | `POST /api/v1/events/module-completions` | same files (`ingest_module_completion`) |
| Goal grade, exam date, topics, availability, daily limit | The student (Set up page) | `POST /api/v1/plans` | `app/api/plans.py` → `app/services/plans.py` (`create_plan`) |
| Session outcomes (Done / Partial / Missed, minutes) | The student (Study plan page) | task outcome endpoints | `app/services/task_outcomes.py` |
| Timer actions | The student | timer endpoints | `app/services/timer.py` |
| Topic list and exam mark share | NIE syllabus file | `shared/contracts/topics.json` → `scripts/seed_topics.py` | seeded into the database |

### 1.2 How inputs are verified (deterministically)

**Schema validation** – `app/schemas/events.py`. Show this file. It rejects:
- a score below 0, or `max_score` ≤ 0;
- `NaN` / infinity (`allow_inf_nan=False`);
- `difficulty` or `confidence` outside 0–1;
- a timestamp without a time zone;
- an empty evidence list or more than 200 items.

**Business rules** – `app/services/event_ingestion.py`:
- an **unknown topic** is rejected;
- an **unknown question** is accepted but flagged (`unknown_question_ids`);
- the same `event_id` twice is **idempotent** (no double counting); the same `event_id` with a *different* payload is a conflict.

**Security** – ingest endpoints need an API key; student endpoints need a valid Supabase JWT (`tests/test_security.py`).

**Proof in tests** (`tests/test_events.py`):
`test_invalid_evidence_is_rejected_by_schema`, `test_non_finite_score_is_rejected_by_schema`, `test_duplicate_assessment_event_is_idempotent`, `test_event_id_cannot_be_reused_for_different_payload`, `test_unknown_topic_is_rejected`, `test_missing_api_key_is_rejected`, `test_bad_api_key_is_rejected`.

Plan inputs: `tests/test_plans.py::test_invalid_plan_inputs_are_rejected`, `test_unknown_topic_is_rejected`, `test_new_student_cannot_create_an_adaptive_plan_and_is_told_why`.

**Database level** – constraints in `app/models/` (and migrations 0001–0009) make bad rows impossible even if code is wrong (`tests/test_models.py::test_task_outcome_columns_and_constraints_are_defined`, `test_topic_evidence_is_idempotent_per_event_topic_and_question`).

---

## 2. PROCESS – what the system does with the input

The chain, in the order the code runs it:

```
evidence rows
   │  (1) mastery.py        compute_mastery()           → mastery per topic (0–1)
   ▼
mastery + exam weight + prerequisites
   │  (2) achievability.py  expected_gain_per_hour()    → marks gained per study hour
   │                        allocate_hours()            → hours per topic
   ▼
hours per topic
   │  (3) roadmap.py        forecast_weeks()            → week-by-week plan
   │      rolling.py        checkpoint_status()         → when to re-plan
   ▼
this-window hours + availability
   │  (4) scheduler.py      schedule_tasks()            → dated sessions
   │      scheduling.py     (catch-up time, reschedule)
   ▼
   (5) achievability.py     projected_score_range(), grade_for() → predicted grade range
       achievability.py     build_coaching_message()    → kind message
```

### 2.1 Step 1 – Mastery (`app/services/mastery.py`, `compute_mastery`)

```
adjusted score = score / max_score + 0.5 × (difficulty − 0.5)      (clamped 0–1)
weight         = exp(−age_days / 45) × (0.75 + difficulty)
performance    = weighted average of adjusted scores
consistency    = 1 − 2 × √(weighted variance)                      (clamped 0–1)
coverage       = min(number of results / 5, 1)
mastery        = 0.75 × performance + 0.15 × consistency + 0.10 × coverage
```
All constants are in `app/services/weights.py` (`MASTERY_COMPONENT_WEIGHTS`, `DIFFICULTY_ADJUSTMENT`, `COVERAGE_TARGET_EVIDENCE`, `RECENCY_HALF_LIFE_DAYS`). The function takes `as_of` (a fixed time) so it never depends on the real clock when tested.

### 2.2 Step 2 – Gain per hour and hour allocation (`app/services/achievability.py`)

```
learning_rate(m)        = 0.12 × (1 − 0.75 × m)
gain per hour           = exam_weight × (1 − mastery) × learning_rate(mastery) × prerequisite_penalty
prerequisite_penalty    = max(0, 1 − 0.35 × number of weak prerequisites)     (weak = mastery < 0.6)
allocate_hours(topics, total_hours): greedy – give the next 0.25 h to the topic with the highest marginal gain, with diminishing returns
```
Topics with no exam weight use a neutral 0.5 (`effective_exam_weight`).

### 2.3 Step 3 – Rolling roadmap (`app/services/roadmap.py`, `app/services/rolling.py`)
- `committed_window_days` → 14 days (7 when fewer than 21 days remain; the final week is never split).
- `forecast_weeks` → every week until the exam, later weeks marked forecast; `project_mastery` moves mastery forward week by week.
- `checkpoint_status` → a checkpoint is due when the window ends or a new full paper arrives (≥ 3 days after the last).
- `apply_overload_rule` / `compress_allocation` → adherence < 0.6 drops the lowest-gain topics first.
- `is_final_week` / `final_week_activity` → last 7 days are revision-only (no new theory).

### 2.4 Step 4 – Scheduler (`app/services/scheduler.py`, `app/services/scheduling.py`)
Places sessions inside the student's free slots. Hard rules: minimum 30 minutes, whole 30-minute blocks, daily cap (counting minutes already booked), at most 2 back-to-back sessions of one topic, prerequisites first, nothing outside availability, 15 % catch-up time kept free (`_reserve_catch_up_time`).

### 2.5 Step 5 – Predicted grade (`app/services/achievability.py`)
```
expected  = current weighted mastery + (total expected gain ÷ total exam weight)
range     = expected ± max(0.05, 0.2 / (1 + 0.08 × number of assessments))
grade     = first band reached: A ≥ 0.75, B ≥ 0.65, C ≥ 0.50, S ≥ 0.35, else F
status    = on_track (expected ≥ target) | stretch (high ≥ target) | out_of_reach
```

### 2.6 The ML part (separate, advisory)
`app/ai/` – XGBoost predicts the next score and whether a topic stays weak. It feeds the *prediction* views; the timetable itself comes from the formulas above. If no model is available, a rule fallback (`0.55 × last + 0.35 × mastery + 0.10 × mean`) is used.

---

## 3. OUTPUT – what comes out

| Output | Where the student sees it | Code that builds it |
|---|---|---|
| Mastery per topic / unit | Dashboard (unit mastery) | `mastery.py`, `dashboard.py` |
| Hours per topic and "why this task" | Study plan cards | `achievability.py`, `task_content.py` |
| Dated study sessions | Study plan | `scheduler.py`, `scheduling.py` |
| Week-by-week roadmap, committed vs forecast | Roadmap section | `roadmap.py` (`get_roadmap`) |
| Predicted grade range, status, coaching message | Coaching card | `achievability.py` (`build_achievability_report`, `build_coaching_message`) |
| Reminders / missed alerts | Notification bell | `notifications.py` |
| Motivation message | Motivation card | `motivation.py` |
| Next-score and weak-topic predictions | Dashboard | `predictions.py`, `app/ai/` |

Every API response goes through a Pydantic response schema in `app/schemas/`, so the **shape** of every output is also checked.

---

## 4. HOW THE OUTPUT IS VERIFIED – deterministically

### 4.1 What "deterministic" means here
- The calculation functions are **pure**: they use only their arguments (no hidden state, no `random`, no network).
- Time is **injected** (`as_of`, fixed clocks in tests), so a result never changes with today's date.
- Therefore **same input → same output**, and a test can assert an exact value.

### 4.2 Live proof you can run in front of the panel

Run this from `planning-service/`. It uses the real functions, a fixed date, and prints the same numbers every time:

```bash
python - <<'EOF'
from datetime import datetime, timedelta, UTC
from app.services.mastery import compute_mastery, EvidenceObservation as O
from app.services.achievability import expected_gain_per_hour, allocate_hours, grade_for

now = datetime(2026, 10, 22, tzinfo=UTC)
evidence = [
    O(score=4, max_score=10, difficulty=0.5, observed_at=now - timedelta(days=20)),
    O(score=6, max_score=10, difficulty=0.5, observed_at=now - timedelta(days=10)),
    O(score=8, max_score=10, difficulty=0.5, observed_at=now - timedelta(days=1)),
]
print("mastery run 1:", compute_mastery(evidence, as_of=now))
print("mastery run 2:", compute_mastery(evidence, as_of=now))   # identical

a = {"topic_id": "a", "exam_weight": 0.6, "mastery": 0.3}
b = {"topic_id": "b", "exam_weight": 0.2, "mastery": 0.8}
print("gain/hour a:", expected_gain_per_hour(a))
print("gain/hour b:", expected_gain_per_hour(b))
print("6 hours ->", allocate_hours([a, b], 6))
print("grade 0.70 / 0.75 / 0.34 ->", grade_for(0.70), grade_for(0.75), grade_for(0.34))
EOF
```

**Result of this exact run (checked):**

| Call | Output |
|---|---|
| `compute_mastery` (both runs) | `0.6325155476398039` – identical twice |
| gain per hour, topic a | `0.03906` |
| gain per hour, topic b | `0.00192` |
| `allocate_hours` 6 h | `{'a': 6.0, 'b': 0.0}` |
| `grade_for` 0.70 / 0.75 / 0.34 | `B` / `A` / `F` |

**Why topic a's number is right (hand-checkable from the formula, not from you "eyeballing" it):**
`learning_rate(0.3) = 0.12 × (1 − 0.75 × 0.3) = 0.093`, then `0.6 × (1 − 0.3) × 0.093 = 0.03906`. Topic b: `0.2 × 0.2 × 0.12 × (1 − 0.6) = 0.00192`. Topic a gives about 20× more marks per hour, so the greedy allocator gives it all 6 hours. The code and the formula agree, and the test suite pins the formula.

### 4.3 The automated tests that pin each stage (exact assertions)

| Stage | Test file | Tests to point at |
|---|---|---|
| Mastery | `tests/test_mastery.py` | `test_mastery_gives_more_weight_to_recent_evidence`, `test_mastery_rewards_coverage_and_consistent_performance`, `test_harder_question_marks_indicate_less_weakness_than_easy_marks`, `test_component_weights_sum_to_one`, `test_invalid_evidence_is_rejected` |
| Priority | `tests/test_priority.py` | `test_priority_is_monotonic_for_weakness_and_importance`, `test_priority_accounts_for_exam_weight_same_mastery`, `test_priority_rejects_out_of_range_inputs` |
| Hours / grades | `tests/test_achievability.py` | `test_hours_are_allocated_to_the_highest_gain_topics_first`, `test_more_hours_never_lowers_projected_score`, `test_learning_rate_has_diminishing_returns_and_prerequisite_penalty`, `test_allocation_satisfies_unmet_prerequisite_before_dependent_topic`, `test_projected_range_never_collapses_to_a_single_value`, `test_status_always_agrees_with_the_range_the_student_sees`, `test_more_days_or_hours_never_make_the_status_worse`, `test_days_to_exam_computed_from_today_with_fixed_clock` |
| Roadmap | `tests/test_rolling.py` | `test_committed_window_is_14_days_then_7_and_never_splits_the_final_week`, `test_roadmap_covers_every_week_until_exam_and_labels_forecast_weeks`, `test_compression_drops_lowest_gain_topics_first_and_keeps_the_best`, `test_final_week_activities_never_contain_new_theory`, `test_checkpoint_is_due_when_the_window_ends` |
| Scheduler | `tests/test_scheduler.py` | `test_scheduler_respects_hard_constraints_for_200_randomized_inputs`, `test_no_session_is_shorter_than_the_minimum`, `test_topic_time_is_planned_in_whole_30_minute_blocks`, `test_minutes_already_booked_count_toward_the_daily_cap`, `test_scheduler_interleaves_topics_and_limits_consecutive_sessions` |
| Plans end to end | `tests/test_plans.py` | `test_create_plan_persists_constraints_slots_and_audit_log`, `test_manual_mode_uses_only_selected_topics`, `test_predicted_mode_uses_stored_mastery`, `test_student_cannot_read_another_students_plan` |
| Outcomes / undo | `tests/test_task_outcomes.py`, `tests/test_undo.py` | missed → reschedule, undo within 24 h |
| Timer, notifications, motivation | `tests/test_timer.py`, `tests/test_notifications.py`, `tests/test_motivation.py` | state machine, grace period, quiet hours, no repeats |
| ML | `tests/test_prediction_training.py`, `tests/test_prediction_features.py`, `tests/test_prediction_hybrid.py` | `test_features_ignore_evidence_after_as_of`, `test_training_samples_predict_next_observation_from_past_only`, `test_rule_fallback_and_confidence_are_bounded` |

### 4.4 Invariant (property) checks – "it must always be true"

These do not check one answer; they check a **rule across many inputs**, which is stronger than a hand check:

- Scheduler: for **200 randomised** availability/commitment sets, no session is outside availability, overlaps a commitment, breaks the daily cap, is under 30 minutes, or breaks the same-topic limit (`test_scheduler_respects_hard_constraints_for_200_randomized_inputs`).
- Allocation: more hours never lowers the projected score; hours go to the highest-gain topic first.
- Status: the status always agrees with the range the student sees; more days or hours never make it worse.
- Mastery weights always sum to 1.
- Final week: no theory step can appear.

### 4.5 Data-leak guarantee for the ML part
`test_features_ignore_evidence_after_as_of` and `test_training_samples_predict_next_observation_from_past_only` prove the model never sees future data. Model quality is measured on a **held-out later time period**, not on the training data (see `docs/planning-technical-deep-dive.md`, section 4).

### 4.6 Audit trail
Plan creation and edits are written to an audit log (`test_create_plan_persists_constraints_slots_and_audit_log`, `test_update_plan_logs_constraint_edits`), and every task stores its reason and inputs ("Why this task?"). Any output can be traced back to the inputs that produced it.

### 4.7 Static checks
`ruff check .` (style/bugs), `npx tsc --noEmit` (types), `npm run lint`, `npx vitest run` (83 UI tests), `npm run build`.

---

## 5. Honest limits (say these before they ask)

- Verification proves the **code does what it is specified to do**, deterministically. It does **not** prove the plan raises real students' marks; that needs a real pilot.
- The ML models are trained on **synthetic** data; their numbers (71.3 % weak-topic accuracy vs 51.4 % baseline, AUC 0.80) show the pipeline works, not real-world accuracy.
- Exam weights are **estimates** from past-paper analysis (`shared/contracts/topics.json` notes this) and should be checked against real papers.

---

## 6. Where to click when asked "show me the code for …"

| Panel asks | Open this | Function / line to show | Prove it with |
|---|---|---|---|
| "How do you validate the input?" | `app/schemas/events.py` | `EvidenceItem`, `AssessmentEvent` | `pytest tests/test_events.py -v` |
| "How is mastery calculated?" | `app/services/mastery.py:32` | `compute_mastery` | `pytest tests/test_mastery.py -v` |
| "Where are the numbers/weights?" | `app/services/weights.py` | all constants | `test_component_weights_sum_to_one` |
| "Where are exam weights?" | `shared/contracts/topics.json`, `scripts/seed_topics.py:113` | `exam_mark_share`, `_derive_exam_weights` | `pytest tests/test_seed_topics.py -v` |
| "How do you decide which topic first?" | `app/services/achievability.py:227, 254` | `expected_gain_per_hour`, `allocate_hours` | `pytest tests/test_achievability.py -v` |
| "How is the timetable built?" | `app/services/scheduler.py:234` | `schedule_tasks` | `pytest tests/test_scheduler.py -v` |
| "How do you plan the whole period?" | `app/services/roadmap.py:166`, `rolling.py:34` | `forecast_weeks`, `checkpoint_status` | `pytest tests/test_rolling.py -v` |
| "What if the student overloads?" | `app/services/roadmap.py:502` | `apply_overload_rule` | `test_low_adherence_compresses_plan_logs_it_and_never_changes_target` |
| "How is the grade predicted?" | `app/services/achievability.py:306, 371` | `projected_score_range`, `build_achievability_report` | `test_status_always_agrees_with_the_range_the_student_sees` |
| "Is the ML trained properly?" | `app/ai/` | training + features | `pytest tests/test_prediction_training.py -v` |
| "What if a session is missed?" | `app/services/task_outcomes.py` | outcome → `keep_existing` reschedule | `pytest tests/test_task_outcomes.py tests/test_undo.py -v` |
| "How do you handle security?" | `app/security.py` (JWT) / `tests/test_security.py` | token + API key checks | `pytest tests/test_security.py -v` |

---

## 7. Ready answers to the three trick questions

**"How do you know the output is correct, without checking it yourself?"**
"Each stage is a pure function tested with exact expected values and with rules that must always hold. I can run `pytest` now and it re-verifies all 315 checks. Mastery of the same evidence at the same date gave `0.6325155476398039` twice, and the gain-per-hour value matches the formula I can compute by hand."

**"What stops garbage input?"**
"Pydantic rejects NaN, negative scores, bad ranges and missing time zones before any calculation; the database has constraints; duplicate events are idempotent; unknown topics are rejected. Each of those has a named test."

**"Is it just trusting the ML?"**
"No. The timetable and grade range come from deterministic formulas. The ML model only predicts the next score and weak topics, is measured on a later held-out period against baselines, and has a rule fallback if it is unavailable."
