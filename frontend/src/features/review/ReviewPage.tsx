import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/api/client";
import { agreement, decidePoint, reviewQueue, reviewScripts } from "@/api/review";
import type { Agreement, ReviewItem, ReviewScript } from "@/api/types";
import { Card } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { readTeacherRef } from "@/lib/teacher";

import { AgreementPanel } from "./AgreementPanel";
import type { Decided } from "./JustDecided";
import { JustDecided } from "./JustDecided";
import { ReviewQueue } from "./ReviewQueue";
import { ScriptList } from "./ScriptList";
import { ScriptMarker } from "./ScriptMarker";

type Tab = "scripts" | "queue";

/** Gated by RequireAuth role="teacher" in App.tsx - a signed-in account of at
 * least teacher rank is guaranteed by the time this renders. */
export function ReviewPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [scripts, setScripts] = useState<ReviewScript[]>([]);
  const [stats, setStats] = useState<Agreement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<number | null>(null);
  const [decided, setDecided] = useState<Decided[]>([]);
  const [tab, setTab] = useState<Tab>("scripts");
  const [open, setOpen] = useState<ReviewScript | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [queue, totals, allScripts] = await Promise.all([
        reviewQueue({}, signal),
        agreement(undefined, signal),
        reviewScripts(undefined, signal),
      ]);
      setItems(queue);
      setStats(totals);
      setScripts(allScripts);
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
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refreshStats = useCallback(async () => {
    try {
      setStats(await agreement());
    } catch {
      // The headline numbers can wait; marking must not be interrupted.
    }
  }, []);

  function remember(item: ReviewItem, awarded: boolean, peeked: boolean) {
    setDecided((current) => [
      {
        id: item.id,
        question: item.question,
        code: item.code,
        teacherAwarded: awarded,
        aiAwarded: item.ai_awarded,
        blind: !peeked,
      },
      ...current,
    ]);
  }

  async function decide(item: ReviewItem, awarded: boolean, comment: string, peeked: boolean) {
    setDeciding(item.id);
    try {
      await decidePoint(item.id, {
        awarded,
        teacher_ref: readTeacherRef() || "teacher",
        comment: comment.trim() === "" ? null : comment,
        saw_machine: peeked,
      });
      // Take the decided point off the list and refresh the agreement numbers.
      setItems((current) => current.filter((other) => other.id !== item.id));
      remember(item, awarded, peeked);
      await refreshStats();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setDeciding(null);
    }
  }

  const queueContent = items.length === 0 ? (
    <Card>
      <p className="text-slate-600">
        Nothing is waiting here. Every point the machine was unsure about has been decided.
        To mark more, open a script on the other tab.
      </p>
    </Card>
  ) : (
    <ReviewQueue
      items={items}
      deciding={deciding}
      onDecide={(item, awarded, comment, peeked) => void decide(item, awarded, comment, peeked)}
    />
  );

  if (loading) {
    return <Spinner label="Loading the review queue..." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Teacher review</h1>
        <p className="mt-1 text-sm text-slate-500">
          Signed in as {user?.name ?? "teacher"}.{" "}
          <span className="font-medium text-slate-700">
            {decided.length} decided in this session, {items.length} still waiting.
          </span>
        </p>
      </div>

      {error && <ErrorBox message={error} />}

      {stats && <AgreementPanel data={stats} />}

      <JustDecided decisions={decided} />

      {open ? (
        <ScriptMarker
          script={open}
          onBack={() => {
            setOpen(null);
            void load();
          }}
          onDecided={refreshStats}
        />
      ) : (
        <>
          <div className="flex gap-2 border-b border-slate-200">
            <TabButton now={tab} name="scripts" onPick={setTab}>
              AI review points by script ({scripts.length})
            </TabButton>
            <TabButton now={tab} name="queue" onPick={setTab}>
              Points the machine was unsure about ({items.length})
            </TabButton>
          </div>

          {tab === "scripts" ? <ScriptList scripts={scripts} onOpen={setOpen} /> : queueContent}
        </>
      )}
    </div>
  );
}

function TabButton({
  now,
  name,
  onPick,
  children,
}: Readonly<{
  now: Tab;
  name: Tab;
  onPick: (name: Tab) => void;
  children: ReactNode;
}>) {
  const active = now === name;
  return (
    <button
      type="button"
      onClick={() => onPick(name)}
      className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
        active
          ? "border-brand-600 font-medium text-brand-700"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
