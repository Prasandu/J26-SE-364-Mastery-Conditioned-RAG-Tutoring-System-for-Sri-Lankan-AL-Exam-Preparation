import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/api/client";
import { decidePoint, scriptPoints } from "@/api/review";
import type { ReviewItem, ReviewScript } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { readTeacherRef } from "@/lib/teacher";

import { Progress } from "../attempt/Progress";
import { ReviewCard } from "./ReviewCard";

interface Props {
  script: ReviewScript;
  onBack: () => void;
  onDecided: () => void;
}

/**
 * Marking one script right through, point by point.
 *
 * Unlike the queue, this shows every point, including the ones the machine was sure
 * about. Those are the interesting ones: a point the machine got confidently wrong
 * never reaches the queue, so it would never be found.
 */
export function ScriptMarker({ script, onBack, onDecided }: Props) {
  const [points, setPoints] = useState<ReviewItem[] | null>(null);
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    scriptPoints(script.attempt_id, controller.signal)
      .then(setPoints)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof ApiError ? cause.message : String(cause));
        }
      });
    return () => controller.abort();
  }, [script.attempt_id]);

  const decide = useCallback(
    async (item: ReviewItem, awarded: boolean, comment: string, peeked: boolean) => {
      setBusy(item.id);
      try {
        await decidePoint(item.id, {
          awarded,
          teacher_ref: readTeacherRef() || "teacher",
          comment: comment.trim() === "" ? null : comment,
          saw_machine: peeked,
        });
        setDone((current) => ({ ...current, [item.id]: true }));
        onDecided();
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : String(cause));
      } finally {
        setBusy(null);
      }
    },
    [onDecided],
  );

  if (error) {
    return <ErrorBox message={error} />;
  }
  if (!points) {
    return <Spinner label="Loading the script..." />;
  }

  const waiting = points.filter((point) => !done[point.id]);
  const marked = points.length - waiting.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="text-sm text-brand-700 hover:underline">
            &larr; All scripts
          </button>
          <h2 className="mt-1 font-medium">
            {script.student_ref}{" "}
            <span className="font-normal text-slate-500">{script.paper_title}</span>
          </h2>
        </div>
        <div className="min-w-48">
          <Progress answered={marked} total={points.length} />
        </div>
      </div>

      {waiting.length === 0 ? (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="good">script finished</Badge>
            <p className="text-slate-600">Every point of this script has been marked. Thank you.</p>
            <Button className="ml-auto" onClick={onBack}>
              Next script
            </Button>
          </div>
        </Card>
      ) : (
        waiting.map((item) => (
          <ReviewCard
            key={item.id}
            item={item}
            busy={busy === item.id}
            onDecide={(awarded, comment, peeked) => void decide(item, awarded, comment, peeked)}
          />
        ))
      )}
    </div>
  );
}
