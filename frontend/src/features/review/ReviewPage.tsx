import { useCallback, useEffect, useState } from "react";

import { agreement, decidePoint, reviewQueue } from "@/api/review";
import { ApiError } from "@/api/client";
import type { Agreement, ReviewItem } from "@/api/types";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { readTeacherKey, readTeacherRef, saveTeacherKey } from "@/lib/teacher";

import { AgreementPanel } from "./AgreementPanel";
import { ReviewCard } from "./ReviewCard";
import { TeacherSignIn } from "./TeacherSignIn";

export function ReviewPage() {
  const [signedIn, setSignedIn] = useState(() => readTeacherKey() !== "");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState<Agreement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<number | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [queue, totals] = await Promise.all([
        reviewQueue({ status: "needs_review" }, signal),
        agreement(undefined, signal),
      ]);
      setItems(queue);
      setStats(totals);
      setError(null);
    } catch (cause) {
      if (signal?.aborted) {
        return;
      }
      setError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [signedIn, load]);

  async function decide(item: ReviewItem, awarded: boolean, comment: string) {
    setDeciding(item.id);
    try {
      await decidePoint(item.id, {
        awarded,
        teacher_ref: readTeacherRef() || "teacher",
        comment: comment.trim() === "" ? null : comment,
      });
      // Take the decided point off the list and refresh the agreement numbers.
      setItems((current) => current.filter((other) => other.id !== item.id));
      setStats(await agreement());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setDeciding(null);
    }
  }

  function signOut() {
    saveTeacherKey("");
    setSignedIn(false);
    setItems([]);
    setStats(null);
  }

  if (!signedIn) {
    return <TeacherSignIn initialRef={readTeacherRef()} onReady={() => setSignedIn(true)} />;
  }
  if (loading) {
    return <Spinner label="Loading the review queue..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Teacher review</h1>
          <p className="mt-1 text-sm text-slate-500">
            Marking the machine was not sure about. Signed in as {readTeacherRef() || "teacher"}.
          </p>
        </div>
        <Button variant="secondary" onClick={signOut}>
          Sign out
        </Button>
      </div>

      {error && (
        <ErrorBox message={error} hint="A wrong teacher key gives 401. Sign out and try again." />
      )}

      {stats && <AgreementPanel data={stats} />}

      {items.length === 0 ? (
        <Card>
          <p className="text-slate-600">
            Nothing is waiting for review. Every point the machine was unsure about has been
            decided.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="font-medium">
            {items.length} {items.length === 1 ? "point" : "points"} waiting
          </h2>
          {items.map((item) => (
            <ReviewCard
              key={item.id}
              item={item}
              busy={deciding === item.id}
              onDecide={(awarded, comment) => void decide(item, awarded, comment)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
