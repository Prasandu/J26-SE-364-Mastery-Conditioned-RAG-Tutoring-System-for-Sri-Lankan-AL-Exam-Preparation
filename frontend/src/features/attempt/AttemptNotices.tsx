import type { Attempt } from "../../api/types";

/** Legacy AI-marks policy: say plainly when a total is provisional or includes marks the
 * earlier automatic marker decided without a teacher. */
export function AttemptNotices({ attempt }: { attempt: Attempt }) {
  return (
    <>
      {attempt.score_is_provisional && (
        <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="note">
          This total was given before a teacher re-checked some points. It is provisional and can
          go up or down once a teacher has decided them.
        </p>
      )}
      {attempt.includes_ai_judged_marks && (
        <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700" role="note">
          Some marks in this result were decided by the earlier automatic marker and have not been
          checked by a teacher. You can ask your teacher to review them.
        </p>
      )}
    </>
  );
}
