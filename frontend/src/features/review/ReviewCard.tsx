import { useEffect, useRef, useState } from "react";

import type { ReviewItem } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { marks } from "@/lib/format";
import { reviewReason } from "@/lib/reviewReason";

import { MachineOpinion } from "./MachineOpinion";
import { AnswerPhotos } from "./AnswerPhotos";
import { MachineReading } from "./MachineReading";

interface Props {
  readonly item: ReviewItem;
  readonly busy: boolean;
  readonly onDecide: (awarded: boolean, comment: string, peeked: boolean) => void;
}

/**
 * One point waiting for a teacher.
 *
 * Deliberate order: the question, then the model answer, then what the student
 * wrote, then the buttons. What the machine thought comes last and starts hidden.
 */
export function ReviewCard({ item, busy, onDecide }: Props) {
  const [comment, setComment] = useState("");
  const [peeked, setPeeked] = useState(false);
  // Which button was pressed, so the card says what is being saved rather than
  // only that something is. A decided point leaves the queue, so this is cleared
  // again only when the save failed and the card is still here.
  const [choice, setChoice] = useState<boolean | null>(null);
  const wasBusy = useRef(false);
  const reason = reviewReason(item);

  useEffect(() => {
    if (wasBusy.current && !busy) {
      setChoice(null);
    }
    wasBusy.current = busy;
  }, [busy]);

  function decide(awarded: boolean) {
    setChoice(awarded);
    onDecide(awarded, comment, peeked);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">
          {item.section} {item.question}
        </span>
        <Badge>{item.code}</Badge>
        <Badge tone="good">{marks(item.marks)}</Badge>
        {reason && <Badge tone={reason.code === "ai_not_run" ? "neutral" : "warn"}>{reason.label}</Badge>}
        <span className="ml-auto text-slate-400">student {item.student_ref}</span>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{item.question_text}</p>

      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-slate-500">Does the answer earn this mark?</dt>
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

        <MachineReading item={item} />
        <AnswerPhotos item={item} />
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
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={busy} onClick={() => decide(true)}>
            {choice === true ? `Awarding ${marks(item.marks)}...` : `Award ${marks(item.marks)}`}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => decide(false)}>
            {choice === false ? "Not awarding..." : "Do not award"}
          </Button>
          {busy && (
            <span className="text-xs font-medium text-brand-700">
              Saving - this point will leave the list once it is done
            </span>
          )}
        </div>
        <MachineOpinion item={item} open={false} onOpen={() => setPeeked(true)} />
      </div>
    </Card>
  );
}
