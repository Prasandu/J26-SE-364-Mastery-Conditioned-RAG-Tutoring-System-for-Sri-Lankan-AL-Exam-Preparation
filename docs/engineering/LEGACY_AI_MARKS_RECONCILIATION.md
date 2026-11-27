# Legacy AI-awarded marks: reconciliation plan

_Status 2026-11-27. **Operator decision, corrected 2026-11-27: no AI-only decision is an official mark, whatever its confidence.** Every historical AI-decided point stays provisional, and outside trusted mastery, until an approved deterministic checker or an authorized teacher validates it. Confidence may only order the review. The policy is implemented and tested locally. It has **not been run on any real database**, and `--apply` on real student data needs explicit operator approval._

> Superseded: the first version of the decision ("confidence > 0.5 kept and labelled") was never applied to real data. The code no longer keeps any AI-only mark. Audit rows that version may have written in test databases (`action = kept_labelled`) do not stop a point from being sent now.

## Decision as implemented

- Code: `assessment-service/app/services/legacy_ai_policy.py`. CLI: `python -m app.reconcile_legacy_ai_marks` (dry run by default; `--apply`; `--priority-threshold`, default 0.5; `--revert RUN_ID`).
- **Every** AI-decided point (`method = llm`, awarded or not awarded) goes to teacher review: `needs_review`, 0 marks counted. The AI verdict, confidence and evidence stay on the point as the teacher's suggestion.
- **Confidence sets only `review_priority`**: `high` at or below the threshold or when none was recorded, `normal` above it (migration 0026). It never keeps or awards a mark.
- **Original results are preserved.** Each sent point's previous status, marks, attempt status and confidence are written to `legacy_ai_reclassifications` (migrations 0024/0026, RLS). Nothing is deleted.
- **The attempt total is provisional.** The attempt becomes `submitted` and keeps its old total as provisional until the points are decided. The existing review flow (`review.record_decision` → `refresh_scores`) then recomputes it.
- **Before any run**, an attempt that still counts an AI-only decision is already reported as `score_is_provisional` with `includes_ai_judged_marks`. Students are told the marks are not official (`frontend/src/features/attempt/AttemptNotices.tsx`).
- AI-only decisions never reach mastery or the planner feed (`TRUSTED_METHODS`). This is tested for a 0.9-confidence point.
- A run is one transaction and running it again touches nothing new. A revert keeps any decision a teacher made since.
- Tests: `assessment-service/tests/test_legacy_ai_policy.py` (SQLite and Postgres) and `frontend/tests/AttemptNotices.test.tsx`.

**To run on the real database, only after explicit approval:**

1. Back it up.
2. Run the dry run and review the counts.
3. Run `--apply` and keep the printed `run_id`.
4. Teachers work through the queue, `high` priority first.

A later approved deterministic checker could validate some points automatically. That is a separate, reviewed re-marking job, not part of this script.

## The problem

Before GRD-011, assessment-service let a generative AI judge decide marking points: `point_results.method = 'llm'` with status `awarded` or `not_awarded`. Those marks are part of the stored `attempts.score` of attempts marked then.

Since GRD-011:

- An AI verdict is only a suggestion (`needs_review`, 0 marks). The verdict, its confidence and its evidence are kept for the teacher.
- Mastery and planner feeds count only rule, checker and teacher decisions:
  - `TRUSTED_METHODS` in `assessment-service/app/services/mastery.py`;
  - the `GET /integration/events` producer;
  - the planner consumer, which records any other evidence class as `legacy_unverified`.

Historical attempt scores are therefore unchanged and may still include AI-awarded marks. `[VERIFIED IN CURRENT CODE]`

## Step 1 - measure (read-only, safe to run now)

```
cd assessment-service
python -m app.report_legacy_ai_marks --summary   # totals
python -m app.report_legacy_ai_marks > legacy.csv  # one row per affected attempt
```

The report (`app/services/legacy_ai_marks.py`) writes nothing; its session is rolled back. Students appear only as 12-hex-digit pseudonyms.

Columns:

| Column | Meaning |
|---|---|
| `stored_score` | The attempt's current score. |
| `ai_points` | Number of points an AI judge decided. |
| `ai_awarded_marks` | Marks those points contribute. This is an upper bound on how much the score would fall without them: question caps and "best N of M" sections can make the real difference smaller. |
| `ai_not_awarded_points` | Points where the AI judge withheld marks that a teacher might award. |

`[TESTED]` in `tests/test_integration_events.py::test_the_legacy_ai_report_lists_pre_grd011_ai_marks_and_changes_nothing`, on SQLite and on a disposable Postgres. It has not been run on any real database.

## Step 2 - operator decision (required)

Choose one, per paper or for all papers:

| Option | Effect | Risk |
|---|---|---|
| A. Keep as historical, labelled | Scores stay. Reports and exports label them "includes AI-judged marks (pre-review policy)". They never reach mastery or the planner (already true). | Students and teachers may still see a score that no teacher confirmed. |
| B. Re-review | Each AI-decided point goes back to the teacher queue (`needs_review`, original verdict kept as the suggestion). The score is recomputed only after the teacher decides. | Teacher workload is `ai_points` reviews; until then the attempt shows as partly unmarked. |
| C. Recompute without AI marks | AI-decided points become `needs_review` with 0 marks, and scores are recomputed now. | Scores drop immediately. Needs communication to students and teachers. |

Constraints for every option:

- Never delete a `point_results` row or its AI evidence. Append a review/audit record instead.
- Run it as a migration or script with a dry run, a count before and after, and a backup or snapshot taken first.
- Do it only after the operator approves, in writing, the option, the scope (papers and dates) and the communication to students.
- Do not run it against the shared Supabase project until that project is reachable again and backed up (`BASELINE_AUDIT.md`, M0 remote blocker).

## Step 3 - after the decision

Once an option is approved:

- Implement it as an idempotent script with `--dry-run`.
- Test it on a disposable database.
- Record the commands and counts in `EXECUTION_STATE.md`.

For option B or C, a teacher's decision is a new `source_version` in the finalized-mark feed, so the planner picks up the teacher-verified mark automatically. Nothing changes in the planner.
