import type { Attempt, PointResult, QuestionResult } from "@/api/types";
import type { BadgeTone } from "@/components/Badge";
import { Badge } from "@/components/Badge";

const TONES: Record<string, BadgeTone> = {
  awarded: "good",
  not_awarded: "bad",
  needs_review: "warn",
  pending: "neutral",
};

const WORDS: Record<string, string> = {
  awarded: "correct",
  not_awarded: "wrong",
  needs_review: "teacher will check",
  pending: "waiting to be marked",
};

// Who decided this point. The research compares these against each other.
const MARKERS: Record<string, string> = {
  rule: "answer key",
  checker: "chemistry checker",
  llm: "AI judge",
  teacher: "teacher",
};

/** Per question: what was answered, what it scored, and the reason for each point. */
export function ResultList({ attempt }: { attempt: Attempt }) {
  const answered = attempt.questions.filter((question) => question.answer !== null);

  if (answered.length === 0) {
    return <p className="text-sm text-slate-500">No answers were given.</p>;
  }

  return (
    <ol className="divide-y divide-slate-100">
      {answered.map((question) => (
        <li key={question.question_id} className="py-4">
          <QuestionResultRow question={question} />
        </li>
      ))}
    </ol>
  );
}

function QuestionResultRow({ question }: { question: QuestionResult }) {
  const answer = question.answer!;
  const mcq = answer.mcq_option !== null;

  return (
    <div className="flex gap-3">
      <span className="w-12 shrink-0 font-mono text-sm text-teal-700">{question.label}</span>

      <div className="min-w-0 flex-1 space-y-2">
        {mcq ? (
          <p className="text-sm text-slate-600">
            you chose <strong className="font-mono">{answer.mcq_option}</strong>
          </p>
        ) : (
          <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-sm text-slate-700">
            {answer.text || "(left blank)"}
          </p>
        )}

        {question.points.length === 0 ? (
          <p className="text-sm text-slate-400">Not marked yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {question.points.map((point) => (
              <PointRow key={point.code} point={point} compact={mcq} />
            ))}
          </ul>
        )}
      </div>

      <span className="shrink-0 text-sm tabular-nums text-slate-500">
        {question.score ?? 0} / {question.max_marks ?? 0}
      </span>
    </div>
  );
}

function PointRow({ point, compact }: { point: PointResult; compact: boolean }) {
  return (
    <li className="flex flex-wrap items-baseline gap-2 text-sm">
      <Badge tone={TONES[point.status] ?? "neutral"}>{WORDS[point.status] ?? point.status}</Badge>
      {!compact && <span className="text-slate-600">{point.description}</span>}
      {point.reason && <span className="text-slate-500">{point.reason}</span>}
      <MarkedBy point={point} />
    </li>
  );
}

/** "marked by AI judge, 99% sure" - so a teacher can see where a mark came from. */
function MarkedBy({ point }: { point: PointResult }) {
  if (point.method === null) {
    return null;
  }
  const who = MARKERS[point.method] ?? point.method;
  const sure = point.confidence === null ? "" : `, ${Math.round(point.confidence * 100)}% sure`;
  return (
    <span className="text-xs text-slate-400" title={point.marker ?? undefined}>
      marked by {who}
      {sure}
    </span>
  );
}
