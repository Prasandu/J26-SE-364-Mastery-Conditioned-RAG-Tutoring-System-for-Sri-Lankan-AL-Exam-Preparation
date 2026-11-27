# Commercial readiness plan (Phase 7) - decisions needed first

Nothing here activates payments, creates accounts with a provider or incurs a cost. Phase 7
changes the data model of four services that share one database. The choices in §2 are
the owner's to make before code is written.

## 1. Personal data held today (data map)

| Component | Tables with student or teacher data |
|---|---|
| C2 assessment (`public`) | `users`, `attempts`, `answers`, `answer_images`, `point_results`, `point_reviews`, `classes`, `class_students`, `class_teachers`, `legacy_ai_reclassifications` |
| C3 planner (`planning`) | `raw_events`, `topic_evidence`, `learner_topic_state`, `assessment_decisions`, `study_plans`, `study_tasks`, `roadmap_weeks`, `availability_slots`, `predictions`, `profile_embeddings`, `motivation_state`, `notifications`, `notification_preferences`, `replan_log` |
| C4 tutor (`support`) | `student_attempts`, `hint_events`, `intervention_events`, `flagged_questions` |
| C1 lab (`public`) | `sessions`, `action_events`, `notebooks`, `reports` |

**Identity.**

- Every service keys students by the Supabase user id.
- C2 also stores the email and name. Supabase Auth holds the credentials.

**Uploads.**

- Answer images are held in C2's `answer_images`.
- C4's voice audio is sent to a hosted speech provider (Groq or Gemini).

Most A/L students are minors. Sri Lanka's Personal Data Protection Act, No. 9 of 2022 applies. **Retention periods, the lawful basis and guardian consent need legal advice.** The engineering defaults to propose once they are decided:

- academic records kept while enrolled plus a fixed period;
- uploaded images and voice purged sooner;
- AI request metadata (no content) kept for cost monitoring only.

## 2. Decisions needed

1. **Tenancy (institutions).**
   - **(a)** One deployment, an `institution_id` on every student-data row, and RLS and service checks by institution.
   - **(b)** A separate Supabase project per institution.
   - **(c)** Individual students only for now.
2. **Entitlements.**
   - **(a)** One shared `entitlements` table (plan, features, quotas) that each service reads; payment provider later, after approval.
   - **(b)** A per-institution licence flag only.
3. **AI cost monitoring.**
   - **(a)** A per-call usage ledger in each service (provider, model, tokens, latency, outcome, pseudonymous user id, never content), plus a daily admin summary.
   - **(b)** Rely on provider dashboards.

## 3. Safe work that does not depend on §2

- **Accessibility.**
  - Automated axe checks on the integrated frontend's main pages.
  - Keyboard-only and contrast checks are already required for the lab (CLAUDE.md quality gate).
- **Support documentation.** Student and teacher quick-start guides, and how marks and AI assistance work (AI explains; teachers and rules mark).
- **Progress reports.** These already exist: the lab report (practical competency estimate), C4's Wivarana report and the planner dashboard. Any combined report depends on decision 1.
- **Retention tooling.** A read-only report of record counts by age per table, to size a policy before anything is deleted.
