import type { Attempt } from "@/api/types";
import { Card } from "@/components/Card";
import type { Step } from "@/components/Steps";
import { Steps, WorkBar } from "@/components/Steps";
import { spell, useElapsed } from "@/hooks/useElapsed";

// Past this, something is probably wrong rather than slow.
const SLOW_AFTER_SECONDS = 90;

/**
 * What is happening between pressing Submit and seeing a score.
 *
 * Written answers go to the AI judge, which takes a few seconds each, so the wait is
 * real and a bare spinner leaves the student wondering whether it has frozen. The
 * counts here are live: every point decided moves the bar.
 */
export function MarkingProgress({ attempt }: { attempt: Attempt }) {
  const seconds = useElapsed(true);

  const points = attempt.questions.flatMap((question) => question.points);
  const decided = points.filter((point) => point.status !== "pending").length;
  const written = attempt.questions.filter((q) => q.answer?.text).length;
  const instant = points.filter((point) => point.method === "rule").length;
  // Every point has a verdict, but some of those verdicts are "needs_review" - the
  // AI/checker was not confident enough to decide on its own, so a teacher does.
  // This is not slow; it is finished as far as this page can take it by itself, so
  // it will never move past this on its own and should say so, not look stuck.
  const forTeacher = points.filter((point) => point.status === "needs_review").length;
  const needsTeacher = decided === points.length && forTeacher > 0;

  const steps: Step[] = [
    {
      label: "Your answers are saved",
      detail: `${attempt.questions.filter((q) => q.answer).length} questions answered`,
      state: "done",
    },
    {
      label: "Multiple choice marked",
      detail: instant ? `${instant} answered against the official key` : undefined,
      state: instant > 0 ? "done" : "waiting",
    },
    {
      label: "Written answers being marked",
      detail: written
        ? `${written} written ${written === 1 ? "answer" : "answers"}, checked point by point`
        : "nothing written to mark",
      state: decided < points.length ? "doing" : "done",
    },
    needsTeacher
      ? {
          label: "Your score",
          detail: `${forTeacher} marking ${forTeacher === 1 ? "point needs" : "points need"} a teacher to check them first`,
          state: "doing",
        }
      : { label: "Your score", state: "waiting" },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium tracking-tight">Marking your paper</h2>
        <span className="text-sm text-slate-500">{spell(seconds)} so far</span>
      </div>

      <p className="mt-1 text-sm text-slate-600">
        {needsTeacher
          ? "The machine checked everything it could on its own. What's left needs a teacher's eyes."
          : "You can leave this page open. It finishes on its own, usually in under a minute."}
      </p>

      {points.length > 0 && (
        <div className="mt-5">
          <WorkBar done={decided} total={points.length} label="Marking points decided" />
        </div>
      )}

      <div className="mt-6">
        <Steps steps={steps} />
      </div>

      {needsTeacher ? (
        <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {forTeacher === 1 ? "One marking point was" : `${forTeacher} marking points were`} not confident
          enough to decide automatically, so they're waiting in a teacher's review queue - not stuck,
          just not done yet. You'll see your score here as soon as that's checked; you don't need to
          keep this page open.
        </p>
      ) : (
        seconds > SLOW_AFTER_SECONDS && (
          <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            This is taking longer than usual. The AI marker may be busy. Your answers are safe either
            way, so you can come back to this page later.
          </p>
        )
      )}
    </Card>
  );
}
