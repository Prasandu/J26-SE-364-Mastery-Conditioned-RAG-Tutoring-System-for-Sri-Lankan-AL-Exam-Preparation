# Legacy AI-awarded marks: reconciliation plan

_Status 2026-11-27. Nothing in this plan has been applied. Every step that changes data needs an explicit operator decision._

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
