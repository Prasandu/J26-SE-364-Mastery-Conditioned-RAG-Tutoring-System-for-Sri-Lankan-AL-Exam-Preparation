import { useState } from "react";

import type { ReviewItem } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { marks } from "@/lib/format";

interface Props {
  item: ReviewItem;
  busy: boolean;
  onDecide: (awarded: boolean, comment: string) => void;
}

function says(value: boolean | null): string {
  if (value === null) {
    return "did not judge";
  }
  return value ? "award" : "do not award";
}

/** One point waiting for a teacher: the evidence, then award or not. */
export function ReviewCard({ item, busy, onDecide }: Props) {
  const [comment, setComment] = useState("");
  const disagreement =
    item.checker_awarded !== null &&
    item.ai_awarded !== null &&
    item.checker_awarded !== item.ai_awarded;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">
          {item.section} {item.question}
        </span>
        <Badge>{item.code}</Badge>
        <Badge tone="good">{marks(item.marks)}</Badge>
        {disagreement && <Badge tone="warn">markers disagreed</Badge>}
        <span className="ml-auto text-slate-400">student {item.student_ref}</span>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{item.question_text}</p>

      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-slate-500">Marking point</dt>
          <dd className="font-medium text-slate-800">{item.description}</dd>
        </div>

        {item.model_answer && (
          <div>
            <dt className="text-slate-500">Model answer</dt>
            <dd className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-slate-700">
              {item.model_answer}
            </dd>
          </div>
        )}

        <div>
          <dt className="text-slate-500">What the student wrote</dt>
          <dd className="whitespace-pre-wrap rounded-lg bg-amber-50 p-3 font-mono text-slate-800">
            {item.student_text || item.student_mcq_option || "(left blank)"}
          </dd>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
          <span>
            chemistry checker: <strong>{says(item.checker_awarded)}</strong>
          </span>
          <span>
            AI judge: <strong>{says(item.ai_awarded)}</strong>
            {item.confidence !== null && ` (${Math.round(item.confidence * 100)}% sure)`}
          </span>
        </div>

        {item.machine_reason && (
          <div>
            <dt className="text-slate-500">Why the machine said that</dt>
            <dd className="text-slate-700">{item.machine_reason}</dd>
          </div>
        )}
      </dl>

      <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
        <label htmlFor={`comment-${item.id}`} className="sr-only">
          Comment for the student
        </label>
        <input
          id={`comment-${item.id}`}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={2000}
          placeholder="Comment for the student (optional)"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
        />
        <div className="flex gap-3">
          <Button disabled={busy} onClick={() => onDecide(true, comment)}>
            Award {marks(item.marks)}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => onDecide(false, comment)}>
            Do not award
          </Button>
        </div>
      </div>
    </Card>
  );
}
