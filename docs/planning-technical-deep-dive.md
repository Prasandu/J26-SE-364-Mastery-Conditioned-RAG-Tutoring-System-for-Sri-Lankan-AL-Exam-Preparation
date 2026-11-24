# Component 3 – Technical Deep Dive

**Adaptive Study Planner (`planning-service/` + planner UI in `frontend/`)**
Project J26-SE-364 – Mastery-Conditioned RAG Tutoring System for Sri Lankan A/L Chemistry

This file explains **how the component is built**: the architecture, the technologies, how the models are trained, how each part works internally, and how everything is tested. Read `planning-component-guide.md` first for the demo steps and the plain-language feature list.

> **Honesty note (use this in the viva).** All training data is **synthetic (mock) data** generated for 20 students over 8 weeks, plus one second dataset used only to check the pipeline. The numbers below show that the pipeline works and beats simple baselines on that data. They are **not** a claim of accuracy on real students. No result is "100% accurate".

---

## 1. The component in one paragraph

The planner takes a student's results, goal grade, exam date and weekly availability. It estimates **mastery per topic**, decides **which topics deserve the most hours** (exam weight × weakness), **schedules sessions** into the student's free time, and keeps the plan up to date as the student studies, misses sessions or sits new papers. It also tells the student **why** each session was chosen, predicts a **grade range**, and sends reminders and motivation messages.

Most of the "intelligence" is **transparent formulas and rules** (so every decision can be explained). Machine learning (XGBoost, optional Bi-LSTM) is used for one narrow job: **predicting the next score and whether a topic will stay weak**.

---

## 2. System architecture

```
 ┌────────────────────────┐        HTTPS + Supabase JWT        ┌──────────────────────────────┐
 │  Frontend (React/Vite) │ ─────────────────────────────────▶ │  planning-service (FastAPI)  │
 │  Dashboard / Plan /    │ ◀───────────────────────────────── │  /api/v1/...                 │
 │  Set up / Timer / Bell │            JSON                    │                              │
 └──────────┬─────────────┘                                    │  api → services → models     │
            │ sign-in                                          │        ↘ ai (ML, explain)    │
            ▼                                                  └──────────────┬───────────────┘
 ┌────────────────────────┐                                                   │ SQLAlchemy 2 (psycopg 3)
 │  Supabase Auth         │  issues the JWT                                   ▼
 └────────────────────────┘                                    ┌──────────────────────────────┐
                                                               │ Supabase Postgres            │
 Teammates' services ── assessment / module events ──────────▶ │ schema `planning` (17 tables)│
 (ingest endpoints, API-key protected, or pulled by adapter)   │ + pgvector                   │
                                                               └──────────────────────────────┘
```

### 2.1 Layers inside `planning-service/app/`

| Layer | What lives there | Rule |
|---|---|---|
| `api/` | FastAPI routers (students, plans, tasks, roadmap, notifications, timer, motivation, dashboard, predictions, events) | Thin: validate input, call a service, return a schema. No business logic. |
| `schemas/` | Pydantic request/response models | The API contract. Bad input is rejected here. |
| `services/` | All the real logic (mastery, weights, roadmap, rolling, scheduling, plans, achievability, timer, notifications, motivation, task_outcomes, dashboard, predictions, event_ingestion, profile_similarity) | Pure, testable functions where possible. |
| `models/` | SQLAlchemy tables (schema `planning`) | One class per table. |
| `adapters/` | `evidence_sources.py` – push or pull evidence from teammates' services behind an `EvidenceSource` protocol | Lets us swap the data source without touching services. |
| `ai/` | ML code: feature builder, training, registry, inference, hybrid Bi-LSTM, SHAP-style explanation, template explanations | Everything model-related is isolated here. |
| `alembic/` | Migrations 0001–0009 | The database changes only through migrations. |
| `scripts/` | `evaluate.py`, `seed_topics.py`, `seed_student_scores.py` | Offline tools, never run by the web app. |

The **tunable numbers** (half-life, buffers, limits, weights) are all in one file: `app/services/weights.py`. Nothing is hidden inside functions.

### 2.2 Security

- Students sign in through **Supabase Auth**; the browser gets a JWT.
- The service validates the JWT (Supabase **JWKS** public keys first, shared secret as fallback) with **PyJWT**, and takes the student id and display name from it. A student can only ever see their own data.
- The event-ingestion endpoints used by teammates' services need an **API key header** instead of a student token.

### 2.3 Data model (schema `planning`)

17 tables, grouped by purpose:

- **Evidence & mastery** – topic evidence (idempotent per event + topic + question), per-topic mastery state, topics and prerequisites.
- **Plans** – study plans, weekly roadmap weeks, checkpoints, scheduled tasks (with timer state, actual minutes, outcome), availability slots.
- **Predictions** – prediction runs (only the last 5 kept), achievability results.
- **Engagement** – notifications, motivation shown-history, task outcome history (for 24 h undo).
- **Similarity** – profile embeddings (pgvector) for "similar student" retrieval.

Migrations 0005–0009 added the timer, notifications, motivation and roadmap/checkpoint tables. Tables are created by Alembic, never by the app at startup.

---

## 3. Technology stack

### Backend
| Tool | Version / note | Used for |
|---|---|---|
| Python | 3.13 | Language |
| FastAPI + Uvicorn | – | REST API, automatic OpenAPI docs |
| Pydantic v2 + pydantic-settings | – | Validation and `.env` configuration |
| SQLAlchemy 2 + psycopg 3 | pool recycling on | Database access |
| Alembic | 9 migrations | Schema versioning |
| Supabase Postgres + pgvector | schema `planning` | Storage, vector similarity |
| PyJWT | – | Verifying Supabase tokens |
| httpx | – | Pull adapter to teammates' services |
| XGBoost | – | Next-score regressor + weak-topic classifier |
| PyTorch | – | Optional Bi-LSTM sequence model |
| scikit-learn | – | Metrics, splitting helpers |
| pytest, ruff | line length 110, rules E,F,I,UP,B | Testing and linting |

### Frontend
| Tool | Version | Used for |
|---|---|---|
| React | 19.1 | UI |
| react-router | 7.5 | Pages: Dashboard, Study plan, Set up |
| TypeScript | 5.8 | Type safety (API types in `api/planning.ts`) |
| Vite | 6.3 | Dev server and build |
| Tailwind CSS | 4.1 | Styling with theme tokens (`index.css`) |
| Recharts | 3.10 | Mastery and roadmap charts |
| supabase-js | – | Sign-in and session |
| Vitest 3.1 + Testing Library 16.3 + jsdom 26 | – | Component tests |
| ESLint | 9.25 | Linting |

**Is it an LLM?** No. The planner does not use a large language model. Explanations and coaching messages are **template-driven** and then **validated** (the validator rejects any topic or number that is not in the plan), so the text can never invent facts.

---

## 4. How the models are trained

### 4.1 Data
- **Source:** `scripts` generate synthetic event files (JSONL): **20 students × 8 weeks**, with different strengths, weak topics and study habits.
- **Samples:** every time a student has an observation on a topic, we build one training row from *only the past* and use the **next** observation as the label. This gives **17,080 samples**.
- **Second dataset:** the trainer also reads OULAD-style assessment CSVs. It is used only to check that the pipeline generalises to a different shape of data.

### 4.2 Features (11 per sample)
Built by the feature builder from evidence **before** a cut-off time (`as_of`). Evidence after the cut-off is ignored (there is a test for this, so data can never leak from the future).

They include: last score, average score, trend, number of assessments, recency-weighted mastery, consistency, coverage, time since last evidence, task adherence and session effectiveness (from the study timer/outcomes), and topic difficulty.

### 4.3 Models
1. **Regressor (XGBoost)** – predicts the **next score** of a topic.
2. **Classifier (XGBoost)** – predicts **weak topic** (next score < 0.5).
3. Settings: **200 trees, depth 4, learning rate 0.04**.
4. **Time-based split 60 / 20 / 20** (train / validation / test by date, never random). Training needs at least **three distinct time periods**, otherwise it refuses to run.
5. **Optional Bi-LSTM hybrid:** a small recurrent network reads the student's score sequence; the final prediction blends it with XGBoost (**weight 0.35** for the sequence model). When the hybrid is disabled the XGBoost value is reused unchanged.
6. **Rule fallback** when no trained model exists or there is too little history: `0.55 × last score + 0.35 × mastery + 0.10 × mean score`. Confidence is always bounded.

### 4.4 Why a time-based split?
A random split lets the model "see the future" of the same student. Splitting by time copies the real situation: train on the past, predict the future.

### 4.5 Measured results (synthetic data, held-out test period)

| Measure | Model | Baseline |
|---|---|---|
| Weak-topic accuracy | **71.3 %** | 51.4 % (always guess the majority class) |
| Weak-topic AUC | **0.80** | 0.50 (random) |
| Score error (MAE) | **0.197** | 0.250 (mean) / 0.270 (last score) |
| Second dataset – accuracy / AUC | 73.4 % / 0.76 | – |
| Second dataset – score error | about the same as "last score" | – |

Say honestly: the classifier is clearly better than guessing; the score regressor beats the baselines on the main dataset but only matches "last score" on the second one.

### 4.6 Explainability
Each prediction returns **SHAP-style feature contributions** ("this score is predicted lower mainly because of a falling trend and few assessments"). The student never sees raw SHAP; the UI shows the plain-language reason.

### 4.7 Model registry
Trained models are saved with their metrics and loaded by a registry at inference. If loading fails, the rule fallback is used, so the planner **never breaks** because of a missing model. Only the last **5 prediction runs** per student are kept.

---

## 5. The formula-based "models" (the core of the planner)

These are deterministic, explainable and unit-tested.

### 5.1 Mastery (per topic)
```
adjusted score = score / max + 0.5 × (difficulty − 0.5)
weight         = recency × (0.75 + difficulty)
recency        = exp(−age_days / 45)          (the real half-life is ≈ 31 days)
performance    = weighted average of adjusted scores
mastery        = 0.75 × performance + 0.15 × consistency + 0.10 × coverage
```
- Harder questions count for more; recent results count for more.
- A topic with **no evidence** gets a neutral prior of **0.30** and the reason "start here".

### 5.2 Which topics get the hours
```
learning rate         = 0.12 × (1 − 0.75 × mastery)
expected gain / hour  = exam_weight × (1 − mastery) × learning rate × prerequisite penalty
```
Hours are handed out **greedily, one hour at a time**, always to the topic with the highest gain; each extra hour on the same topic gives less (**diminishing returns**). Topics whose prerequisites are weak are penalised, so basics come first. Exam weights come from the NIE / A/L paper analysis (`shared/contracts/topics.json`).

### 5.3 Achievability (predicted grade)
- Projected mark = current mastery + gains from the planned hours (gains are **normalised by the total exam weight** so the result cannot be over-optimistic).
- Range = expected ± `max(0.05, 0.2 / (1 + 0.08 × assessments))` – more evidence gives a narrower range.
- Grade bands: **A ≥ 75 %, B ≥ 65 %, C ≥ 50 %, S ≥ 35 %, F below**.
- Status: **on track** (expected ≥ target), **stretch** (best case ≥ target), **out of reach** otherwise. The coaching card turns this into kind wording (on track / stretch / ambitious / "getting started" for new students).

### 5.4 Rolling-horizon roadmap
- Plans the **whole period** week by week, but **commits only the next 14 days** (7 days when fewer than 21 days remain; the final week is never split).
- Later weeks are marked **forecast** and are re-planned at each **checkpoint** (end of the committed window, or a new full paper at least 3 days after the last).
- The **last 7 days are revision-only**.
- **Overload rule:** if adherence falls below 0.6, the load is compressed, and the student chooses *keep my target* or *adjust my goal*.
- **Catch-up buffer:** 15 % of study time is kept free (30-minute blocks) so missed sessions can be moved.

### 5.5 Scheduler
Fills the student's availability with sessions while obeying hard rules:
- never outside availability, never over the daily limit (and counting minutes already booked);
- **minimum session 30 minutes**, planned in whole 30-minute blocks, no tiny tail left over;
- **at most 2 back-to-back sessions of the same topic** per day, topics interleaved;
- prerequisites first; a session already started with the timer is kept;
- `keep_existing` mode re-places only the sessions that changed when something is missed.

If time does not fit, the service reports the **shortfall** and the UI explains it kindly instead of silently dropping it.

### 5.6 Timer, notifications, motivation
- **Timer** is a server-side state machine (idle → running → paused → finished). The browser only displays it, so refreshing the page never loses time.
- **Notifications** are produced by a sweep on every request plus a 60-second poll: reminder before a session, "missed" after a 30-minute grace, quiet hours respected, de-duplicated, max 3 shown.
- **Motivation messages** use a shuffle-bag per category (no repeats until the bag is empty) with a stress hook.
- **Undo** of an outcome is allowed for 24 hours.

### 5.7 Explanations and "similar students"
- A profile embedding (fixed 16 dimensions) is built from mastery per topic and stored in pgvector; **cosine similarity** finds similar students, and only an **anonymised plan mix** is reused.
- Template explanations are checked by a validator that rejects topics or numbers not in the plan.

---

## 6. Request flows (how it works end to end)

**Creating a plan**
1. Student fills Set up (goal, exam date, topics, availability, daily limit) → `POST /plans`.
2. Service checks readiness (`GET /students/me/plan-readiness`): Adaptive mode needs at least one result; otherwise it is disabled with a kind reason.
3. Mastery → weights → hour allocation → roadmap → scheduler → achievability → coaching message, all stored.
4. The UI shows the plan, the roadmap and "why this session".

**Studying a session**
Start → timer state saved on the server → Done / Partial (minutes studied) / Missed → outcome stored → mastery evidence updated → if Partial/Missed, **only the affected topic** is rescheduled into catch-up time (`keep_existing`) → toast or amber notice if no free slot exists.

**New result arrives** (from a teammate's service)
Event ingest (idempotent) → evidence stored → mastery recomputed → a checkpoint may fire → remaining weeks are re-forecast.

---

## 7. Testing – what types of tests we use

| Type | What it checks | Where / examples |
|---|---|---|
| **Unit tests** | One function, no database | mastery maths, weights, achievability bands, motivation shuffle-bag, error-message wording |
| **Property / randomised tests** | Rules hold for many random inputs | `test_scheduler_respects_hard_constraints_for_200_randomized_inputs` – 200 random availability/commitment sets, every hard rule verified |
| **Scheduler rule tests** | Each rule in isolation | minimum session length, 30-minute blocks, no short tail, interleaving, ≤ 2 consecutive, daily cap counts booked minutes, single topic continues on later days |
| **API / integration tests** | Endpoint → service → (test) database | plan creation, tasks, timer, notifications, roadmap, readiness, dashboard |
| **Security tests** | Auth behaviour | valid token accepted, invalid rejected, missing config reported, JWKS URL derived, ingest endpoint requires API key |
| **Regression tests** | A bug that happened must not return | notification grace pinned to 30 min, orphaned alerts, all-hours-on-one-topic, recency wording |
| **Data-leak tests (ML)** | No future information in features | `test_features_ignore_evidence_after_as_of`, `test_training_samples_predict_next_observation_from_past_only` |
| **Model training tests** | Training pipeline and metrics | time-aware training reports baselines, reads synthetic JSONL and OULAD CSV, refuses fewer than 3 time periods, helpful message when data is missing |
| **Model behaviour tests** | Bounded, safe outputs | rule fallback and confidence bounded, hybrid returns a bounded value, hybrid reuses XGBoost when disabled, comparison table lists all model types |
| **Database/model definition tests** | Schema constraints | all models live in schema `planning`, evidence idempotency, task-outcome constraints |
| **Adapter tests (mocked HTTP)** | Teammate integration | pull source needs a configured URL, validates events, reports upstream HTTP errors |
| **Explainability tests** | Safe text | validator rejects topics/numbers not in the plan, template fallback, similar-student strategy reused |
| **Frontend component tests** (Vitest + Testing Library, jsdom) | What the student sees and clicks | Plan page cards, Set up (prefill, Adaptive disabled, replace-plan dialog), timer controls, notices, dialogs |
| **Mocked-API and fake-timer tests** | UI logic without a server | API module mocked; fake timers drive the timer tick and the 60 s poll |
| **Static checks** | Code quality | `ruff` (backend), `tsc` and `ESLint` (frontend), `vite build` |
| **Offline evaluation / simulation** | Does the planner actually help | `scripts/evaluate.py` simulates students and compares strategies with paired comparisons and confidence intervals; measures model vs. baselines |

**Current counts:** backend **315 tests passing**, frontend **83 tests passing** (11 files), `tsc` clean, ESLint 0 errors, `ruff` clean.

**What the tests do *not* prove:** they prove the code does what it was designed to do. They do not prove the plan improves real students' marks – that needs a real pilot.

### How to run
```bash
# backend
cd planning-service
ruff check .
pytest

# frontend
cd frontend
npx tsc --noEmit
npm run lint
npx vitest run
npm run build
```

---

## 8. Likely viva questions (short answers)

- **Is it an LLM?** No. Formulas and rules for planning; XGBoost (and an optional Bi-LSTM) for next-score prediction; templates with a validator for text.
- **Why not deep learning for everything?** Small data and the need to explain every decision to a student.
- **How do you avoid data leakage?** Features use only evidence before `as_of`; the split is by time; tests enforce both.
- **What if the model is missing or has too little data?** Rule fallback, so the plan still works.
- **How accurate is it?** 71.3 % weak-topic accuracy vs 51.4 % baseline (AUC 0.80) on synthetic data; we do not claim real-world accuracy.
- **What happens when a student misses a session?** Only that topic is moved into the 15 % catch-up time; if nothing fits, the student is told kindly.
- **Why a rolling horizon?** Long fixed plans go stale; committing two weeks and re-planning at checkpoints keeps them realistic.
- **How is privacy handled?** JWT per student; similar-student retrieval returns only an anonymised plan mix.
