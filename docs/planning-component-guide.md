# Adaptive Study Planner — Complete Guide

Component: **Planning service + planner frontend** of the Mastery-Conditioned RAG Tutoring System for Sri Lankan A/L Chemistry.

This guide explains what the planner does, how every calculation works, which models were trained on which data, how each feature behaves step by step (for example, what happens when a student misses a session), and how to run the demo.

---

## Contents

1. [What the planner does](#1-what-the-planner-does)
2. [Architecture](#2-architecture)
3. [Setup and running](#3-setup-and-running)
4. [Data and datasets](#4-data-and-datasets)
5. [Machine-learning models](#5-machine-learning-models)
6. [Core calculations](#6-core-calculations)
7. [Features and their processes](#7-features-and-their-processes)
8. [Evaluation](#8-evaluation)
9. [Demo script (step by step)](#9-demo-script-step-by-step)
10. [Configuration reference](#10-configuration-reference)
11. [Honest claims, limitations and future work](#11-honest-claims-limitations-and-future-work)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. What the planner does

A student enters their exam date, target grade and the times they are free to study. The planner then:

- estimates their **mastery** of every Chemistry topic from their past results;
- decides **which topics matter most** (weak topics that carry many exam marks);
- builds a **14-day timetable of study sessions**, each with a reason ("Why this task?") and steps (theory, practice questions, review);
- shows a **roadmap** of every week until the exam;
- **adapts** when the student misses sessions, gets new results, or falls behind;
- **times** study sessions, **reminds** the student before sessions, and alerts them kindly when a session is missed;
- shows a **dashboard** with predicted grade, mastery by unit, decline alerts, a daily motivation message and a what-if study estimate.

Marks are expected to come from the team's assessment services (past papers and quizzes); the planner receives them through ingest endpoints. For the demo, labelled synthetic data is used.

---

## 2. Architecture

| Part | Technology | Location |
|---|---|---|
| Planning API | Python 3.13, FastAPI, SQLAlchemy, Alembic | `planning-service/` |
| Database | PostgreSQL on Supabase (schema `planning`) | migrations `planning-service/migrations/versions/` |
| Authentication | Supabase Auth (JWT bearer tokens) | `app/security.py` |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Recharts | `frontend/src/features/planning/` |
| Shared contracts | Topic catalogue, question bank, motivation messages | `shared/contracts/` |

Main backend modules (`planning-service/app/services/`):

| Module | Responsibility |
|---|---|
| `mastery.py` | Mastery, trend, error rate, weakness score |
| `priority.py` | Priority score, activity choice, SM-2 review schedule |
| `achievability.py` | Expected gains, hour allocation, projected range, status, coaching text |
| `scheduling.py`, `scheduler.py` | Turning priorities into timed sessions |
| `roadmap.py`, `rolling.py` | Rolling-horizon roadmap, checkpoints, overload handling |
| `task_outcomes.py` | Done / Partial / Missed, undo, weekly replan |
| `timer.py` | Server-backed study timer |
| `notifications.py` | Reminders and missed-session alerts |
| `motivation.py` | Daily motivation messages |
| `dashboard.py`, `predictions.py` | Dashboard data, ML predictions, what-if |
| `decline.py` | Decline alerts |
| `weights.py` | **All tunable constants in one place** |

---

## 3. Setup and running

```powershell
# Backend
cd planning-service
python -m pip install -r requirements.txt
python -m alembic upgrade head          # creates/updates tables (migrations 0001–0009)
python -m scripts.seed_topics            # loads topics.json with exam weights
python -m uvicorn app.main:app --host 127.0.0.1 --port 8083 --reload

# Frontend (second terminal)
cd frontend
npm install
npm run dev                              # http://localhost:5173/planning
```

Quality checks:

```powershell
cd planning-service; python -m ruff check .; python -m pytest -q      # 307 tests
cd ../frontend;      npx tsc -b; npm test                             # 61 tests
```

---

## 4. Data and datasets

> All student data used for development, training and the demo is **synthetic and labelled as such**. Real marks will come from the team's assessment services through the ingest endpoints.

| Dataset | What it is | Size | How it is made |
|---|---|---|---|
| **Topic catalogue** `shared/contracts/topics.json` | NIE A/L Chemistry syllabus: 14 units → topic groups → leaf topics, with **exam mark share per unit** | 14 units, 195 topics (≈122 leaf topics) | Hand-written from the syllabus; mark shares from past-paper estimates |
| **Question bank sample** `shared/contracts/question_bank.csv` | Example questions linked to topics | 9 rows (sample) | Hand-written, labelled "SAMPLE" |
| **Mock component events** `data/mock/` | Assessment events for training the ML model | 20 students × 8 weeks = 160 events (all leaf topics each week) | `python -m tools.mock_components` — hidden ability per student and topic plus noise |
| **Generated demo datasets** `data/generated/` | 3 named demo personas + 47 synthetic students: assessment and completion events, teacher rankings, training scores | 400 assessment events, 300 completion events, 48 788 training score rows, 1 220 teacher-ranking rows | `python -m scripts.generate_datasets` (seed 364) |
| **Seeded demo students** | Past papers for one student at a chosen grade | e.g. 8 papers, 160 topic scores | `python -m scripts.seed_student_scores --student <uuid> --grade S` |

### Exam weights (from the mark shares)

Each unit's approximate share of A/L marks (midpoint of past-paper estimates) is split evenly across its leaf topics and rescaled so the largest is 1:

| Unit | Mark share | Topic weight |
|---|---|---|
| u6 s, p, d block elements | 19% | 1.00 |
| u12 Chemical equilibrium | 13.5% | 0.57 |
| u14 Industrial & environmental | 9% | 0.54 |
| u8 Hydrocarbons | 9% | 0.38 |
| u9 Oxygen compounds, u13 Electrochemistry | 7% | 0.37 |
| u11 Kinetics | 6% | 0.32 |
| u5 Energetics | 7% | 0.29 |
| u7 Basic organic concepts *(placeholder)* | 5% | 0.26 |
| u3 Calculations, u4 Gaseous state | 4.5%, 3.5% | 0.24–0.25 |
| u10 Nitrogen compounds, u2 Bonding | 5%, 4.5% | 0.19–0.21 |
| u1 Atomic structure | 2.5% | 0.10 |

These figures must be cited or replaced with counts from real past papers.

### Seeding a demo student at a grade

```powershell
python -m scripts.seed_student_scores --student <uuid> --grade S --dry-run   # preview
python -m scripts.seed_student_scores --student <uuid> --grade S             # save
python -m scripts.seed_student_scores --student <uuid> --grade S --reset     # replace earlier seed
```

Papers go through the normal ingest path, so mastery, trends and decline alerts are computed exactly as for real results. Raw scores are **calibrated against the mastery formula** so the student's average mastery lands in the chosen band (for S: raw papers ≈29% → mastery ≈42%).

---

## 5. Machine-learning models

### 5.1 XGBoost (trained)

Two models are trained from topic-score histories:

| Model | Predicts | Algorithm |
|---|---|---|
| **Score model** | The student's **next score** on a topic (0–1) | `XGBRegressor` (200 trees, max depth 4) |
| **Weak-topic model** | Probability the topic is **weak** | `XGBClassifier` (200 trees, max depth 4) |

**Input features (11 per student-topic):** evidence count, last score, mean score, score trend, mean difficulty, days since last evidence, mastery, weakness score, task adherence, mean session effectiveness, last score change. Features are built only from data available *before* the predicted event (no target leakage).

**Training data:** the mock component events (`data/mock/`, 20 students × 8 weeks). The trainer creates next-event samples and splits them **by time** (train → validation → test) so the model is always tested on later data than it learned from.

**Results of the trained model** (`models/xgb-20261012T062933Z-6cb89936`):

| | MAE | RMSE |
|---|---|---|
| **XGBoost** | **0.197** | **0.243** |
| Global-mean baseline | 0.250 | 0.295 |
| Last-score baseline | 0.270 | 0.338 |

Weak-topic classifier: **F1 0.70, AUC 0.80**. Samples: 17 080 (train 10 004, validation 3 538, test 3 538).

XGBoost beats both baselines by about 21% on MAE. These numbers come from synthetic data; they show the pipeline works, not real-world accuracy.

**How to train:**

```powershell
python -m tools.mock_components --output-dir data/mock --seed 364     # only if no data
python -m app.ai.prediction.train --data-dir data --model-dir models --seed 364
```

Each run writes a versioned folder under `models/` and updates `models/latest`. The trainer also accepts OULAD CSVs and topic-evidence CSVs.

### 5.2 Hybrid Bi-LSTM (optional)

A small Bi-LSTM-style sequence model over each topic's score history can be blended with XGBoost (`HYBRID_MODEL_ENABLED=true`, stacking weight 0.35). If PyTorch is unavailable, a deterministic sequence heuristic is used.

### 5.3 Rule-based fallback

If no trained model is available, predictions use a labelled rule:

```
next score     = 0.55 × last score + 0.35 × mastery + 0.10 × mean score
confidence     = 0.15 + 0.80 × min(evidence/8, 1) × e^(−days since evidence / 180)   (max 0.95)
```

### 5.4 What uses the ML model and what does not

| Part | Uses |
|---|---|
| Predicted score and grade on the dashboard; dashboard coaching starting score | **XGBoost** (or the rule fallback) |
| Mastery, priorities, schedule, roadmap, achievability status, coaching messages | **Transparent formulas** (section 6), chosen on purpose so every decision can be explained |

Predictions are saved per run; only the newest 5 runs per student are kept.

---

## 6. Core calculations

All constants live in `planning-service/app/services/weights.py`.

### 6.1 Mastery (0–1) per topic

For each result on the topic:

```
adjusted score = score/max + 0.5 × (difficulty − 0.5)          (harder questions count a little higher)
weight         = recency × (0.75 + difficulty)                  (recency halves every 45 days)
```

```
performance = weighted mean of adjusted scores
consistency = 1 − 2 × weighted standard deviation              (erratic results lower it)
coverage    = min(number of results / 5, 1)                    (few results lower it)

mastery = 0.75 × performance + 0.15 × consistency + 0.10 × coverage
```

A topic with no results uses a **neutral estimate of 30%**.

### 6.2 Weakness score

```
weakness = 0.30 × (1 − mastery) + 0.12 × downward trend + 0.14 × error rate
         + 0.12 × staleness + 0.10 × difficulty + 0.12 × exam weight + 0.10 × (1 − confidence)
staleness = 1 − e^(−days since revision / 30)
```

### 6.3 Expected gain per study hour

```
learning rate     = 0.12 × (1 − 0.75 × mastery)                 (slower learning as mastery rises)
gain per hour     = exam weight × (1 − mastery) × learning rate × prerequisite penalty
prerequisite pen. = 1 − 0.35 × (number of prerequisites below 60% mastery)
```

Topics with high exam weight and low mastery give the most marks per hour.

### 6.4 Allocating study hours

Available hours are handed out **in 15-minute steps** to whichever topic currently gives the largest gain, with diminishing returns as a topic receives more time (minimum 30 min, maximum 10 h per topic per allocation). Topics whose prerequisites are weak wait until the prerequisites improve.

### 6.5 Projected score range and grade

```
expected = current score + (total expected gain ÷ total exam weight)
range    = expected ± uncertainty
uncertainty = max(0.05, 0.20 / (1 + 0.08 × number of assessments))
```

The range narrows as the student completes more assessments but never below ±5 points. The grade label follows the **expected** score.

| Grade | Score |
|---|---|
| A | 75–100% |
| B | 65–74% |
| C | 50–64% |
| S | 35–49% |
| F | below 35% |

*(Confirm against the official Department of Examinations boundaries.)*

### 6.6 Target status

| Status | Rule | Coaching message |
|---|---|---|
| **On track** | Expected score reaches the target | "You're on track, keep your pace." + estimated range |
| **Stretch** | Only the top of the range reaches the target | "A focused push can build momentum." + estimated range |
| **Out of reach** | Even the top of the range falls short | "Focus on your best, one day at a time. … don't worry about the final grade." (no grade range) |

Examples with 10 h/week: C → B in 60 days = stretch, in 90 days = on track; C → A in 10 days = out of reach; F → A in 90 days = out of reach. More days or hours never make the status worse (tested).

### 6.7 Activity choice for a session

Checked in order:

1. No results yet or never studied → **Learn the theory**
2. Mastery ≥ 85% and review due → **Quick revision**
3. ≥ 2 wrong answers (below 50%) in the last 5 attempts and mastery < 60% → **Review mistakes**
4. Theory not yet done and mastery < 70% → **Learn the theory**
5. Mastery ≥ 75% → **Past-paper practice**
6. Mastery ≥ 45% → **Structured questions**
7. Otherwise → **Guided practice**

A topic with a decline alert gets **Recovery revision** and a +0.20 priority boost. In the final 7 days, theory is replaced by past papers, mistake review or recovery revision.

### 6.8 Decline alerts

The latest 3 results on a topic are compared with the best earlier results. A drop of **20 percentage points or more** raises an alert ("Your last 3 papers show a decline from 10/10 to 5/10").

### 6.9 Building the timetable (scheduler)

Inputs: availability slots, fixed commitments, sessions already in progress, session length, daily limit, exam date.

Rules, in order of importance:

- never outside availability, never overlapping, never past the exam;
- at most the **maximum session length** per session and the **daily limit** per day;
- **no session shorter than 30 minutes** (unless only a short remainder is left); time is planned in 30-minute blocks;
- **catch-up time:** about 15% of the free time (rounded down, in 30-minute blocks, spread evenly across the study days) is deliberately left unscheduled, so a missed session has somewhere to go;
- **prerequisites first**;
- at most **two back-to-back sessions of the same topic per day**, then move on;
- spread topics across the week; at each free slot pick the highest-priority topic.

Each session stores its reason, steps and practice question IDs (wrong answers first, then unattempted).

---

## 7. Features and their processes

### 7.1 Creating a plan (Set up)

1. The student chooses mode (**Adaptive** = from results, **Manual** = pick topics), exam date, target grade, one or more time slots per day, maximum session length and daily limit.
2. Editing an existing plan prefills every field.
3. **A new student with no results cannot create an Adaptive plan.** Setup asks the server (`GET /api/v1/students/me/plan-readiness`); if there are no results, the **Adaptive** button is disabled with the reason: *"Adaptive plans pick your topics from your assessment results, and you don't have any yet. Take a quiz or past paper first, or choose a Manual plan and pick the topics you want to start with."* The server enforces the same rule (HTTP 409), so the API cannot be used to bypass it. Adaptive unlocks automatically after the first results arrive.
4. **Manual plans work for new students:** they tick the topics they want; each topic starts at the neutral 30% mastery, so time is shared by exam weight until results arrive, and every session starts with theory.
5. The roadmap is built immediately and the starting estimate is stored for later comparison.

### 7.2 Generating sessions (rolling horizon)

The plan has three layers:

| Layer | Covers | Detail |
|---|---|---|
| **Roadmap** | Every week until the exam | Hours per topic per week, labelled *Committed* or *Forecast*; mastery is projected forward week by week |
| **Committed window** | Next **14 days** (7 when fewer than 21 days remain) | Exact sessions with times and steps |
| **Checkpoints** | End of each window, or a new full paper (at most every 3 days) | Rebuild the roadmap and the next window from fresh marks and adherence |

The window never splits the final week: 42 days → windows of 14, 14, 7 and a fixed final 7. In the **final week** the plan stops rolling and contains only revision, past papers and mistake review.

### 7.3 What happens when a student misses a session

**A. The student presses "Missed":**

1. The session is marked *missed* and the time it was recorded is saved.
2. Its minutes are rescheduled **into the next free slot of the current window**; every other session stays where it is. The free slots are mostly the **catch-up time** the plan left open when it was generated (`CATCH_UP_BUFFER`, about 15%). If those gaps are already used up, the student is told there was no free slot and the minutes are not carried over (the next checkpoint rebuilds the window). The topic gets a small priority boost (+0.25) and the new session links back to the missed one.
3. The change is logged in the replan log.
4. The Plan page shows "Moved or added sessions: … — Wed 21 Oct, 5:00 PM", or "No free slot was left in this window" if nothing fits.

**B. The student does nothing (automatic):**

1. Every page load and every 60 seconds the bell checks for sessions that ended **more than 30 minutes ago** (grace period) and were **untouched** (timer never started, not undone).
2. Those sessions are marked missed and rescheduled exactly as in A (one re-plan per plan, not per session).
3. A supportive alert appears: *"No worries, you missed Ketones at 4:00 PM. We've moved it to Wed 21 Oct at 5:00 PM."* If no slot was free, the alert offers **Find a new time**.
4. During quiet hours (22:00–06:00) nothing is marked; the check runs in the morning. Sessions overdue by more than 24 h are marked without an alert.

**C. It was a mistake:** within **24 hours** the student taps **Undo** ("Did you actually study this?"). The session returns to planned, the make-up session is removed (unless already started), the alert is cleared, and the session is never auto-marked missed again.

### 7.4 Partial sessions

The student records the minutes actually studied; only the **remaining minutes** are rescheduled, the same way as a missed session.

### 7.5 Study timer

1. **Start** → the server records the start time; the card shows "Studying 0:00" counting live.
2. **Pause / Resume** → paused time is excluded. Refreshing the page keeps the correct time (it comes from the server).
3. Starting another session automatically pauses the running one (one running timer per student, enforced by the database).
4. **Finish** → a dialog shows measured minutes (capped at the planned length) and **Done / Partial / Missed**.
5. If the session ran more than **3× the planned time** or **past midnight**, the student must confirm the real minutes ("Was the timer left running?").

### 7.6 When the student falls behind (overload)

At a checkpoint or weekly replan, if adherence in the last week is **below 60%**:

1. The plan is lightened: load = adherence + 15% (at least 40% of normal), sessions shortened to 75% (at least 25 min), daily limit reduced.
2. Topics are scaled down; the lowest-gain topics are **paused** if they would get less than 1 hour a week. The highest-gain topics always stay.
3. The student sees why ("Last week you completed 45% of your planned time… Your target grade (A) has not changed.") and chooses:
   - **Keep target** — bring back all topics (with suggested hours per day, or "give it your best every day" if more than 6 h/day would be needed);
   - **Adjust goal** — lower the target to the grade reachable at the current pace.
4. The target is **never changed silently**. When adherence recovers to 60%+, paused topics return automatically.

### 7.7 Checkpoints and range change

At each checkpoint the estimate is recalculated and compared with the previous one:

- moved up → *"Your estimated score moved up from 50% to 58%. Your work is paying off!"*
- moved down → *"…That happens, and your next sessions now focus on the topics that will help most."*
- steady → *"Your estimated range is steady."*

### 7.8 Notifications (bell)

| Alert | When |
|---|---|
| **Reminder** | A planned, untouched session starts within the reminder lead time (default 10 min) |
| **Missed** | See 7.3 B |

Rules: one alert per event (dedupe key), at most 3 unread shown (newest first), reminders cleared once the session starts, alerts for deleted sessions cleared, quiet hours respected. Browser pop-ups only after the student clicks **Turn on browser alerts**. Settings: on/off, lead time (0–120 min), quiet hours.

### 7.9 Coaching card

**Before any results (e.g. a new Manual student):** a welcome card with no grade estimate: *"Welcome! Let's build your starting point. We don't have your results yet, so your first sessions cover the basics of your topics. After your first quiz or paper, we'll estimate your progress towards B."* Topics show "start here" instead of "mastery is 0%". The normal card below replaces it once results arrive.

**With results:** shows greeting, status message (6.6), up to 3 focus topics with reasons, and a daily suggestion based on the student's own study days: *"Aim for about 2 hours on each of your 3 study days, using the time available in your plan."*

### 7.10 Daily motivation

80 short, warm messages in 5 categories. One per student per day, same message all day.

| Category | Chosen when |
|---|---|
| exam_week | 7 or fewer days to the exam |
| recovery | a missed session in the last 3 days or a decline alert in the last 14 |
| celebration | ≥ 80% adherence last week (≥ 60 planned minutes) |
| consistency | studied on 3+ days last week |
| effort | otherwise |

A shuffle bag shows every message in a category once before repeating, never the same message two days running. A well-being hook (`MOTIVATION_STRESS_HOOK`) lets the stress-monitoring component hide the card for highly stressed students.

### 7.11 Dashboard

- Exam countdown, study adherence, predicted grade gauge.
- **Mastery by unit:** 14 units, weakest first, each with an average bar and "N to work on"; click to see sub-topics. "Needs attention" shows only units with a topic below 75%.
- Mastery trend chart, topics to reinforce, decline alerts.
- **What-if study estimate:** the same model as the coaching card is run with and without extra weekly hours: *"69% at your current pace → 70% with 4 extra hours a week (about 28 extra hours over the 49 days left)."*

---

## 8. Evaluation

Run:

```powershell
cd planning-service
python -m scripts.evaluate --teacher-ranking data\generated\teacher_ranking.csv --output data\table-2.md
```

### 8.1 Strategy comparison (50 synthetic students, 56 days)

Adaptive planning vs a static timetable vs a lowest-mark-first heuristic, reporting feasibility violations (always 0), adherence, overdue high-priority tasks, prediction MAE/RMSE and agreement with teacher rankings (Spearman).

### 8.2 Rolling re-planning vs a fixed plan (50 synthetic students, 42 days)

Simulated students' true ability shifts and their study capacity changes on day 21.

| Strategy | Adherence | Gain vs fixed (paired, 95% CI) |
|---|---|---|
| Fixed full-period plan | ~64% | — |
| Rolling 14/7-day window | ~68% | **+0.011 ± 0.003** |
| Rolling 7-day window | ~69% | **+0.015 ± 0.003** |
| Rolling, no compression | ~64% | +0.012 ± 0.002 |

Conclusion: rolling re-planning gives a small but statistically clear mastery gain over a fixed plan; compression mainly improves adherence. The 7-day window reacts faster but re-plans more often (6 vs 4 times). All hard constraints were satisfied (0 violations).

---

## 9. Demo script (step by step)

### Before the demo

1. `python -m alembic upgrade head`, `python -m scripts.seed_topics`.
2. Prepare two students:
   - **Student A (has history):** `python -m scripts.seed_student_scores --student <uuid-A> --grade C`
   - **Student B (new):** a Supabase account with no data (shows that Adaptive is unavailable and Manual works).
   - Optional **Student S (struggling):** `--grade S` to show the effort-focused message.
3. In `planning-service/.env`: `MISSED_GRACE_MINUTES=0.5` (missed alerts after 30 s). Restart the backend.
4. Run the evaluation once and keep a screenshot of the tables.
5. Record a backup video of the whole flow.

### During the demo (~12 minutes)

| # | Show | Say |
|---|---|---|
| 1 | **Set up** as Student B: point out that **Adaptive is disabled with the reason**; choose **Manual**, tick a few topics, exam date, target, two slots on one day, daily limit → Save | "A new student can't get an adaptive plan because there are no results to adapt to, and the system says why. Manual works straight away, and the welcome card appears instead of a grade estimate." |
| 2 | **Study plan**: coaching card, sessions (30/60 min), labels like "Review mistakes" | "Sessions focus on weak, high-mark units like s/p/d block and equilibrium." |
| 3 | **Why this task?** | "Every decision is explained: mastery, trend, exam weight, days left, steps and questions." |
| 4 | **Roadmap** | "We plan every week until the exam but commit to two weeks; the rest is a forecast rebuilt at checkpoints." |
| 5 | **Timer**: Start → refresh → Pause/Resume → Finish → Done | "Study time is measured on the server, so it survives a refresh." |
| 6 | **Missed** on a session | "Only that session moves to the next free slot; nothing else changes." Then **Undo**. |
| 7 | **Live alerts**: set a slot starting in 3–4 minutes (reminder lead 1 min in bell settings), Regenerate, wait | Reminder appears; after the session ends untouched, a supportive missed alert appears. |
| 8 | **Dashboard** as Student A: motivation card, predicted grade, Mastery by unit, what-if | "Mastery is grouped by unit, weakest first. The what-if uses the same model as the coaching card." |
| 9 | Student S's plan page | "When a target isn't realistic, the system encourages effort instead of showing a discouraging grade." |
| 10 | Evaluation tables | "Zero constraint violations; rolling re-planning beats a fixed plan on paired mastery gain." |

### What to say about data

"The demo uses labelled synthetic data. In the full system, marks arrive from the assessment services through the ingest endpoints. The ML model and evaluation are trained and tested on synthetic data; a real-student pilot is future work."

---

## 10. Configuration reference

### Environment (`planning-service/.env`)

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection | — |
| `SUPABASE_URL` / `SUPABASE_JWKS_URL` / `SUPABASE_JWT_SECRET` | Token verification | — |
| `INGEST_API_KEY` | Protects ingest and demo endpoints | — |
| `CORS_ORIGINS` | Allowed frontend addresses (comma-separated) | `http://localhost:5173` |
| `MISSED_GRACE_MINUTES` | Minutes after a session before it counts as missed | 30 (use 0.5 for demos) |
| `HYBRID_MODEL_ENABLED` | Blend Bi-LSTM with XGBoost | false |
| `MOTIVATION_STRESS_HOOK` | `module:function` returning True for high stress | empty |
| `MOTIVATION_MESSAGES_PATH` | Override message file location | repo `shared/contracts/` |

### Key constants (`app/services/weights.py`)

| Constant | Value | Meaning |
|---|---|---|
| `WINDOW_DAYS` / `SHORT_HORIZON_DAYS` | 14 / 7 | Committed window length |
| `FINAL_WEEK_DAYS` | 7 | Revision-only period |
| `ADHERENCE_FLOOR` | 0.60 | Below this, the plan is lightened |
| `MIN_SESSION_MINUTES` | 30 | Shortest session |
| `CATCH_UP_BUFFER` | 0.15 | Share of study time held back as catch-up slots (30-minute blocks) |
| `EVIDENCE_CHECKPOINT_MIN_DAYS` | 3 | Minimum gap between early re-plans |
| `UNDO_WINDOW_HOURS` | 24 | Undo period |
| `MAX_VISIBLE_ALERTS` | 3 | Unread alerts shown |
| `TIMER_CONFIRM_MULTIPLIER` | 3 | Confirm sessions longer than 3× planned |
| `REALISTIC_MAX_HOURS_PER_DAY` | 6 | Never suggest more daily study |
| `ACHIEVABILITY_MIN_UNCERTAINTY` | 0.05 | Range never narrower than ±5 points |
| `ACHIEVABILITY_GRADE_THRESHOLDS` | A .75, B .65, C .50, S .35 | Grade boundaries |
| `NEUTRAL_PRIOR_MASTERY` | 0.30 | Mastery for topics with no results |

---

## 11. Honest claims, limitations and future work

**Claims you can make (measurable):**

- 0 hard-constraint violations in every simulated schedule.
- XGBoost next-score MAE 0.197 vs 0.250 for the best baseline (synthetic data).
- Rolling re-planning improves paired mastery gain over a fixed plan (+0.011 ± 0.003, synthetic simulation).

**Do not claim** that predictions or plans are "100% accurate".

**Limitations:**

- Training and evaluation data are synthetic; the question bank is a 9-row sample.
- Exam mark shares are estimates (chem-u7 is a placeholder); grade boundaries should be confirmed.
- Achievability and learning-rate parameters are assumptions, not fitted to real data.
- Fixed commitments (tuition classes) are supported by the API but not yet in the setup form.
- English-only interface.

**Future work:**

- Fit learning-rate and uncertainty parameters from real student results.
- Count exam weights from real past papers.
- Weekly recurring busy times (tuition) in setup.
- Sinhala and Tamil interface; a "Today" view; a first-time walkthrough.
- A pilot with real students comparing rolling and fixed plans.

---

## 12. Troubleshooting

| Problem | Fix |
|---|---|
| 500 error / "server closed the connection" | Network or Supabase blip; refresh. Check the backend terminal. |
| Error about a missing column | `python -m alembic upgrade head` |
| Old weights or sessions | `python -m scripts.seed_topics`, then **Regenerate plan** |
| No reminder appears | Quiet hours cover now, lead time too short, or the session timer was started |
| Frontend on another machine can't reach the API | Add its address to `CORS_ORIGINS`, restart |
| Button text hard to read / old styles | Hard refresh (Ctrl+F5) |
| Tests fail only on your machine | A demo value in `.env` (e.g. `MISSED_GRACE_MINUTES`) — tests pin their own values, so update the code, not `.env` |
