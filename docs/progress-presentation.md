# Progress Presentation & Viva Preparation

**Component 3: Mastery-Conditioned Adaptive Study Planner**
Mastery-Conditioned RAG Tutoring System for Sri Lankan A/L Exam Preparation (J26-SE-364)
Vidvanga W A U | IT23293694

> **How to use this guide**
> 1. Read section 1 first: it answers the panel's PP05 comments directly. Agree the workflow (1.3) with your supervisor before the presentation.
> 2. Learn the one-sentence contribution (section 2) by heart. Say it in your first minute and again in your conclusion.
> 3. Rehearse the 10-minute plan (section 3) with a timer at least three times.
> 4. Know the model facts (section 4): files, data, accuracy, explainability, why not an LLM.
> 5. Practise the question bank (section 5) aloud. Short, direct answers first; details only if asked.

---

## Contents

1. [Addressing the PP05 panel comments](#1-addressing-the-pp05-panel-comments)
2. [Research contribution](#2-research-contribution--say-this-clearly)
3. [Ten-minute presentation plan](#3-ten-minute-presentation-plan)
4. [The trained models — facts to know](#4-the-trained-models--facts-to-know)
5. [Viva question bank with model answers](#5-viva-question-bank-with-model-answers)
6. [Confidence checklist](#6-confidence-checklist)

---

## 1. Addressing the PP05 panel comments

The panel wrote:

> *"Improve the time management and presentation skills. The research contribution of the component is questionable. Discuss with the supervisor and identify the correct workflow of the component. Component 2 and 3 are having some similar functionalities according to the student explanation."*

Open the next presentation with one slide titled **"Response to PP05 feedback"**. Panels look for this. Use this table as that slide:

| Panel comment | What I did | Evidence to show |
|---|---|---|
| Time management & presentation skills | Fixed 10-minute structure with timed sections; one message per slide; rehearsed with a timer; recorded backup demo. | Slide timer plan (section 3); demo finishes inside its 3-minute slot. |
| Research contribution is questionable | Defined a clear research question, hypotheses and measurable contribution: a mastery-conditioned, rolling-horizon planner evaluated against a fixed plan, plus an explainable trained prediction model evaluated against baselines. | Contribution statement (section 2); rolling vs fixed **+0.011 ± 0.003** paired gain; weak-topic model **71.3% accuracy, AUC 0.80**. |
| Identify the correct workflow (with supervisor) | Drew the end-to-end workflow and the data contract between components; agreed it with the supervisor. | Workflow table (1.3) and the assessment-event contract. |
| Components 2 and 3 seem similar | Separated responsibilities: Component 2 **measures one attempt** (marking, per-question feedback); Component 3 **decides future study over weeks** (mastery over time, prediction, scheduling, adaptation). Component 3 only consumes Component 2's marks. | Boundary table (1.4); integration through ingest events only, no duplicated marking. |

### 1.1 Time management and presentation

- Keep to **10 minutes**: problem (1), contribution (1), workflow (1.5), method (2), demo (3), results (1), feedback response and next steps (0.5).
- One idea per slide; no paragraphs. Numbers on slides, explanations in your voice.
- Prepare a **2-minute recorded demo** as backup. If anything breaks, switch immediately and say so calmly.
- Practise transitions: *"Now that you have seen **what** it does, here is **how well** it works."*
- End on time with one sentence: the contribution and the measured result.

### 1.2 Research contribution (fixing "questionable")

The panel's concern usually means: *"Is this just an app, or is there research?"* Your answer must name a problem, a method that is new in this context, and a measured result. See section 2 for the exact wording.

### 1.3 Workflow of the whole system (agree with your supervisor)

*Draft for discussion. Confirm component names and arrows with your supervisor and teammates before presenting.*

| Step | Component | What happens | Output to the next step |
|---|---|---|---|
| 1 | Component 1 — Learning content (modules) | Student studies modules / RAG explanations | Module completion events |
| 2 | Component 2 — Assessment & marking | Student answers papers/quizzes; answers are marked with reasons | **Assessment events**: student, topic/sub-topic, score, max score, difficulty, time |
| 3 | **Component 3 — Adaptive planner (mine)** | Updates mastery over time, predicts next scores and weak topics, builds and adapts the study plan, reminds and coaches | Study sessions, roadmap, predictions, alerts |
| 4 | Component 4 — Well-being | Monitors stress; can tell Component 3 to hide motivation messages | High-stress flag (hook) |

```
Component 1 (study) ──▶ Component 2 (assessment & marking) ──marks──▶ Component 3 (planner)
        ▲                                                                  │
        └────────────── study sessions, roadmap, reminders ◀──────────────┘
                                   Component 4 (well-being) ──stress flag──▶ Component 3
```

**Loop:** completed sessions lead to new attempts in Component 2, whose marks flow back into Component 3, which re-plans. This closed loop is the core of the component.

### 1.4 Clear boundary between Component 2 and Component 3

| Question | Component 2 (Assessment) | Component 3 (Planner — mine) |
|---|---|---|
| Main question it answers | "How well did the student do on **this** paper?" | "What should the student study **next**, and when, to improve by the exam?" |
| Time scale | One attempt | Weeks until the exam |
| Input | Student answers, marking scheme | Marks from Component 2 (events), availability, exam date, target |
| Output | Marks and per-question feedback | Mastery per topic, predictions, timetable, roadmap, reminders, coaching |
| Methods | Marking, answer checking, AI judging | Mastery estimation, expected-gain allocation, scheduling, rolling re-planning, XGBoost prediction |
| Owns | Questions, papers, marking | Plans, sessions, outcomes, predictions |

> **What to say if the overlap question comes again**
> "Component 2 produces the marks; my component never marks anything. It consumes those marks through one event contract and turns a history of marks into a decision about future study time. If Component 2 disappeared, my component would still work with any assessment source; if mine disappeared, students would have marks but no plan."

---

## 2. Research contribution — say this clearly

> **One-sentence contribution (memorise)**
> A **mastery-conditioned, rolling-horizon study planner** for A/L Chemistry that allocates study time by expected exam-mark gain, adapts to missed sessions and new results, and is shown in simulation to improve mastery gain over a fixed plan, supported by an **explainable** trained model that predicts weak topics.

### Research question

Does a plan that is rebuilt from the student's latest mastery and adherence (rolling horizon) lead to better learning outcomes than a fixed full-period plan, while always respecting the student's real time constraints?

### Hypotheses

- **H1:** Rolling re-planning gives higher mastery gain than a fixed plan. *Tested: +0.011 ± 0.003 paired gain (14/7-day window); +0.015 ± 0.003 (7-day window).*
- **H2:** Plans never violate hard constraints (availability, daily limit, session length, exam date). *Tested: 0 violations.*
- **H3:** A trained model predicts weak topics better than simple rules. *Tested: 71.3% accuracy and AUC 0.80 vs 51.4% majority guess; next-score MAE 0.197 vs 0.250 / 0.270 baselines.*

### What is new (in this context)

- **Exam-weighted expected gain:** study time goes to topics where an hour is worth the most marks (topic mastery × A/L mark share), not just the lowest marks.
- **Rolling horizon for exam study:** plan every week to the exam but commit only to 14 days; checkpoints rebuild the plan; the final week becomes revision-only.
- **Adherence-aware compression with student choice:** when a student falls behind, the plan is lightened and the student chooses "keep target" or "adjust goal"; the target is never lowered silently.
- **Explainability everywhere:** every session has a "Why this task?" reason; predictions come with their top factors (SHAP).
- **Measured, honest evaluation:** paired comparison with confidence intervals and baselines, not "100% accurate" claims.

### Related approaches you can contrast with

- **Static timetables / study-planner apps:** fixed schedules, no mastery, no adaptation.
- **Spaced-repetition tools (SM-2/Anki):** good for recall of single items, but no exam weighting, no time budgeting, no plan to an exam date.
- **Lowest-mark-first heuristics:** ignore exam weight and time; my evaluation includes this as a baseline.

---

## 3. Ten-minute presentation plan

| Time | Slide | Key message |
|---|---|---|
| 0:00–0:30 | Title + response to PP05 | "I addressed all four comments; here is how." |
| 0:30–1:30 | Problem | A/L students have limited time; static plans ignore weak topics, exam weight and missed sessions. |
| 1:30–2:30 | Contribution & research question | The one-sentence contribution; RQ; H1–H3. |
| 2:30–4:00 | Workflow & boundary with Component 2 | Workflow (1.3); boundary (1.4) in one line: "they measure, I plan". |
| 4:00–6:00 | Method | Mastery → expected gain → hour allocation → scheduler → rolling checkpoints; XGBoost for prediction. |
| 6:00–9:00 | Live demo (backup video ready) | Plan + Why this task → roadmap → timer → missed session & undo → dashboard. |
| 9:00–9:45 | Results | 0 violations; rolling vs fixed paired gain; model accuracy vs baselines. |
| 9:45–10:00 | Limitations & next steps | Synthetic data; real-student pilot; integrate live Component 2 marks. |

### Demo order (3 minutes)

1. **Plan page:** coaching card, sessions, open one "Why this task?" (about 15 s each; don't read everything).
2. **Roadmap:** committed vs forecast weeks, final revision week.
3. **Timer:** Start → refresh → still running → Finish → Done.
4. **Missed:** only that session moves; then Undo.
5. **Dashboard:** predicted grade, mastery by unit, what-if.
6. Keep a seeded **S-grade student** ready to show the effort-focused message if asked about weak students.

---

## 4. The trained models — facts to know

### 4.1 What they are

| Model | Predicts | Algorithm | Used for |
|---|---|---|---|
| **Score model** | Student's next score on a topic (0–1) | XGBoost regressor (200 trees, depth 4, learning rate 0.04) | Predicted grade on dashboard, coaching starting score, what-if |
| **Weak-topic model** | Probability a topic is weak (< 50%) | XGBoost classifier (same settings) | Weak-topic flag per topic, stored with each prediction |
| Hybrid (optional) | Blended next score | Bi-LSTM-style sequence model + XGBoost (weight 0.35) | Off by default (`HYBRID_MODEL_ENABLED`) |
| Fallback | Next score | Rule: 0.55 × last + 0.35 × mastery + 0.10 × mean | Used automatically if no trained model loads |

**Inputs (11 features per student-topic):** evidence count, last score, mean score, score trend, mean difficulty, days since last evidence, mastery, weakness score, task adherence, mean session effectiveness, last score change. Features use only data available **before** the predicted attempt (no leakage).

### 4.2 Where everything is (files)

| File / folder | What it contains |
|---|---|
| `planning-service/app/ai/prediction/features.py` | Builds the 11 features; rule-based fallback; confidence formula |
| `planning-service/app/ai/prediction/model.py` | Trains the two XGBoost models, time-based split, metrics vs baselines, SHAP factors in `predict()` |
| `planning-service/app/ai/prediction/train.py` | Loads training data (mock JSONL, topic-evidence CSV, OULAD) and runs training (CLI) |
| `planning-service/app/ai/prediction/registry.py` | Saves versioned models; loads `models/latest` |
| `planning-service/app/ai/prediction/hybrid.py` | Optional Bi-LSTM hybrid |
| `planning-service/app/services/predictions.py` | Runs predictions in the service, falls back to rules, keeps newest 5 runs |
| `planning-service/models/xgb-20261012T062933Z-6cb89936/` | `score-model.json`, `weak-model.json`, `metadata.json` (metrics) |
| `planning-service/tools/mock_components.py` → `data/mock/` | Training data generator: 20 students × 8 weeks |
| `planning-service/scripts/generate_datasets.py` → `data/generated/` | Demo personas + 47 synthetic students; second test dataset |
| `planning-service/scripts/evaluate.py` | Strategy comparison and rolling-vs-fixed evaluation |

### 4.3 How it was trained

- **Data:** synthetic assessment events (20 students × 8 weeks, every leaf topic, scores out of 8) made by `tools/mock_components.py`.
- **Samples:** each attempt becomes one sample (features from earlier attempts → target = this score). **17,080 samples.**
- **Time-based split:** first 60% of dates for training (10,004), next 20% validation (3,538), last 20% test (3,538). The model is always tested on later weeks than it learned from.
- **Commands:**
  ```powershell
  python -m tools.mock_components --output-dir data/mock --seed 364
  python -m app.ai.prediction.train --data-dir data --model-dir models --seed 364
  ```

### 4.4 Accuracy (measured on held-out data)

| Measure | XGBoost | Last-score baseline | Average baseline |
|---|---|---|---|
| Weak-topic accuracy | **71.3%** | – | 51.4% (majority guess) |
| Weak-topic precision / recall / F1 | 70.9% / 69.2% / 70.1% | – | – |
| Weak-topic AUC | **0.80** | – | 0.50 (random) |
| Next-score mean absolute error | **19.7 marks** | 27.0 | 25.0 |
| Next score within ±15 marks | **43.6%** | 40.8% | 26.7% |
| Correct grade band (A/B/C/S/F) | **42.3%** | 37.8% | 13.5% |

*On a second synthetic dataset never used in training: weak-topic accuracy 73.4% (majority 62.4%), AUC 0.76; next-score error 21.2 vs 21.8 for last-score. The weak-topic model generalises better than the exact-score model.*

> **How to state accuracy (say exactly this)**
> "On held-out synthetic data, the weak-topic model is 71% accurate with AUC 0.80, compared with 51% for guessing, and the score model's average error is about 20 marks against 25–27 for simple baselines. These are synthetic results that show the method works; validation on real student marks from Component 2 is the next step."

### 4.5 Why this model is explainable

- XGBoost is a tree model: every prediction can be broken into per-feature contributions (**SHAP values**). `predict()` returns the top 5 factors, e.g. "score trend −0.12, last score −0.08".
- The planner itself uses transparent formulas, so every session shows a plain-language "Why this task?" (mastery, trend, exam weight, days left).
- Confidence is reported and reduced for sparse or old evidence.

### 4.6 Why a trained model and not an LLM

| Reason | Explanation |
|---|---|
| Right tool for the data | Inputs are numbers (scores, dates, minutes). Tree models are among the strongest methods for tabular data; LLMs are unreliable at numeric prediction and can produce confident wrong numbers. |
| Measurable | MAE, F1 and AUC against baselines on held-out data. An LLM's numeric guesses are hard to evaluate this way. |
| Explainable | SHAP factors per prediction; deterministic rules for planning. |
| Private, fast, free | Runs on our server in milliseconds; no student data sent to external APIs; no per-call cost. |
| Reproducible | Same input → same output; needed for fair evaluation. |
| Where LLMs fit | Language tasks in other components (RAG explanations, question generation, marking feedback). My coaching texts are fixed, checked templates, so a struggling student never gets an unsuitable generated message. |

---

## 5. Viva question bank with model answers

*Answer in 2–3 sentences first. Stop. Let them ask for more. If you don't know: "I haven't measured that yet; here is how I would test it."*

### 5.1 Contribution and research

**Q: What is the research contribution of your component?**
**A:** A mastery-conditioned rolling-horizon planner that allocates time by expected exam-mark gain and adapts to missed sessions and new results. In simulation it improves mastery gain over a fixed plan (+0.011 ± 0.003 paired), with zero constraint violations, and it is supported by an explainable model that predicts weak topics (71% accuracy, AUC 0.80).
*Follow-ups:*
- *Isn't this just a timetable app?* → No. A timetable is fixed. Mine re-estimates mastery, re-allocates hours by expected gain and re-plans at checkpoints; that adaptation is what I evaluate.
- *What is novel?* → Combining exam-weighted expected gain, a rolling horizon with a revision-only final week, and adherence-based compression where the student chooses the target trade-off.

**Q: What is your research question and hypothesis?**
**A:** Does rolling re-planning from the latest mastery and adherence give better outcomes than a fixed full-period plan while respecting time constraints? H1: rolling beats fixed on mastery gain; H2: zero hard-constraint violations; H3: the trained model beats simple baselines.
*Follow-up:*
- *How did you test H1?* → I simulated 50 students over 42 days whose true ability and capacity change on day 21, compared strategies on the same students, and reported paired differences with 95% confidence intervals.

**Q: Why simulation instead of real students?**
**A:** Real marks were not yet available, and a fair comparison needs the same students under both strategies, which simulation allows. The simulation uses the planner's own code. A pilot with real students is my next step.
*Follow-up:*
- *Is the simulation biased towards your method?* → The fixed plan is the same day-1 roadmap executed unchanged, and I included a no-compression ablation, so the difference comes from re-planning itself.

### 5.2 Workflow and Component 2 overlap

**Q: How is your component different from Component 2?**
**A:** Component 2 measures a single attempt: marking and feedback. My component uses many results over weeks to decide future study: mastery tracking, prediction, timetable and adaptation. I never mark answers; I consume Component 2's assessment events.
*Follow-ups:*
- *What exactly do you receive from Component 2?* → Assessment events: student, topic/sub-topic, score, max score, difficulty, time and paper ID.
- *What if Component 2 sends quizzes very often?* → Quizzes update mastery, but only full papers trigger early re-planning, at most every 3 days, so the plan stays stable.

**Q: Explain the workflow of your component.**
**A:** Marks arrive → mastery and trend are updated → expected gain per topic is calculated → hours are allocated → the scheduler builds a 14-day timetable → the student studies with the timer → outcomes and new marks feed checkpoints that rebuild the plan.

### 5.3 Models and data

**Q: What models did you train and on what data?**
**A:** Two XGBoost models, a next-score regressor and a weak-topic classifier, trained on 17,080 samples from synthetic assessment data (20 students over 8 weeks) with a time-based train/validation/test split.
*Follow-ups:*
- *Where are they stored?* → `planning-service/models/`, in a versioned folder with `score-model.json`, `weak-model.json` and `metadata.json`; `models/latest` points to the active version.
- *Why 200 trees, depth 4?* → Shallow trees reduce overfitting on a small dataset; I compared against baselines on held-out weeks.

**Q: How accurate is it?**
**A:** Weak-topic accuracy 71.3% (AUC 0.80) vs 51.4% guessing; next-score error 19.7 marks vs 25–27 for baselines. Exact-score prediction is moderate because the synthetic scores are coarse (out of 8) and noisy.
*Follow-ups:*
- *Is 71% good enough?* → For flagging topics to revise, yes: it's clearly better than chance, and the planner also uses transparent rules. I report it honestly and plan to retrain on real marks.
- *Did you avoid data leakage?* → Yes. Features use only earlier attempts, and the test set contains only later dates than training.

**Q: Why not use an LLM?**
**A:** The data is numeric; tree models are the right tool, measurable against baselines, explainable with SHAP, private and fast. LLMs suit language tasks, which other components handle.
*Follow-up:*
- *Could an LLM write the coaching message?* → Possibly, but I chose checked templates so weak students always get safe, encouraging wording.

**Q: How do you explain a prediction to a student?**
**A:** Each prediction returns its top factors (SHAP), and each study session has a "Why this task?" panel with mastery, trend, exam weight, days left and the steps.

**Q: How is mastery calculated?**
**A:** 0.75 × performance (recency- and difficulty-weighted score) + 0.15 × consistency + 0.10 × coverage. Topics with no results start at 30%.
*Follow-up:*
- *Why those weights?* → They are transparent design choices in `weights.py`; fitting them to real data is future work.

### 5.4 Features and edge cases

**Q: What happens if a student misses a session?**
**A:** It is marked missed (manually, or automatically 30 minutes after it ends if untouched), and only its minutes move to the next free slot in the current window; other sessions stay. A supportive alert says where it moved, and the student can undo within 24 hours.

**Q: What if the student keeps falling behind?**
**A:** If weekly adherence drops below 60%, the plan is lightened, low-gain topics are paused, and the student chooses to keep the target or adjust the goal. The target is never lowered silently.

**Q: What does the student see if the target is impossible?**
**A:** An effort-focused message, "Focus on your best, one day at a time", with no discouraging grade. Status is "out of reach" only when even the optimistic end of the projected range misses the target.

**Q: How do you handle the exam's last week?**
**A:** The final 7 days are a fixed revision window: past papers, mistake review and recovery, with no new theory.

### 5.5 Limitations and future work

**Q: What are the limitations?**
**A:** Training and evaluation data are synthetic; exam mark shares are estimates; planning parameters are design assumptions; the UI is English-only.
*Follow-up:*
- *What will you do next?* → Integrate live Component 2 marks, retrain on real data, run a small real-student pilot comparing rolling and fixed plans, and let the weak-topic probability directly influence topic priority.

---

## 6. Confidence checklist

| Before the day | On the day |
|---|---|
| ☐ Workflow agreed with supervisor | ☐ Start with the contribution sentence |
| ☐ Response-to-feedback slide | ☐ Point at numbers, not paragraphs |
| ☐ Rehearsed 3× with a timer | ☐ If a demo step fails, switch to the video calmly |
| ☐ Backup demo video | ☐ Answer short, then stop |
| ☐ Seeded demo students (C and S) | ☐ Say "synthetic" honestly; it builds trust |
| ☐ Migrations + `seed_topics` run | ☐ Never claim 100% accuracy |
| ☐ Evaluation tables screenshotted | ☐ Thank the panel for the PP05 feedback |
| ☐ This guide re-read | |

> **Useful phrases**
> - "That's a good point; I addressed it by …"
> - "I measured that: …" (give the number).
> - "I haven't tested that yet; I would test it by …"
> - "To be precise, the scheduling uses transparent rules; the trained model provides the predictions."
> - "In one sentence: Component 2 measures, my component plans."

---

*All numbers in this guide come from the project code and the saved model metadata (`models/xgb-20261012T062933Z-6cb89936`). If you retrain, update section 4.4.*
