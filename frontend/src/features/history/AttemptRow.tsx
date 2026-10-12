import { Link } from "react-router-dom";

import type { Attempt } from "@/api/types";
import type { BadgeTone } from "@/components/Badge";
import { Badge } from "@/components/Badge";
import { when } from "@/lib/format";

const WORDS: Record<Attempt["status"], string> = {
  in_progress: "still answering",
  submitted: "being marked",
  marked: "marked",
};

const TONES: Record<Attempt["status"], BadgeTone> = {
  in_progress: "warn",
  submitted: "neutral",
  marked: "good",
};

/** One line of the student's history: which paper, what it scored, how to reopen it. */
export function AttemptRow({ attempt, title }: { attempt: Attempt; title: string }) {
  const waiting = attempt.questions.filter((question) =>
    question.points.some((point) => point.status === "needs_review"),
  ).length;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <Link
          to={`/attempts/${attempt.id}`}
          className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
        >
          {title}
        </Link>
        <p className="mt-0.5 text-xs text-slate-500">
          started {when(attempt.started_at)}
          {attempt.submitted_at && ` - handed in ${when(attempt.submitted_at)}`}
        </p>
      </div>

      {waiting > 0 && <Badge tone="warn">{waiting} with a teacher</Badge>}
      <Badge tone={TONES[attempt.status]}>{WORDS[attempt.status]}</Badge>

      <span className="w-24 text-right text-sm text-slate-700">
        {attempt.score === null ? (
          <span className="text-slate-400">no marks yet</span>
        ) : (
          <>
            <strong>{attempt.score}</strong> / {attempt.max_score}
          </>
        )}
      </span>
    </div>
  );
}
