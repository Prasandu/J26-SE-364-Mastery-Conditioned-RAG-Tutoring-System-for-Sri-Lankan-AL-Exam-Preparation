import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/api/client";
import { agreement, decidePoint, reviewQueue, reviewScripts } from "@/api/review";
import type { Agreement, ReviewItem, ReviewScript } from "@/api/types";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { readTeacherKey, readTeacherRef, saveTeacherKey } from "@/lib/teacher";

import { AgreementPanel } from "./AgreementPanel";
import type { Decided } from "./JustDecided";
import { JustDecided } from "./JustDecided";
import { ReviewCard } from "./ReviewCard";
import { ScriptList } from "./ScriptList";
import { ScriptMarker } from "./ScriptMarker";
import { TeacherSignIn } from "./TeacherSignIn";

type Tab = "scripts" | "queue";

export function ReviewPage() {
  const [signedIn, setSignedIn] = useState(() => readTeacherKey() !== "");
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
        reviewQueue({ status: "needs_review" }, signal),
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
    if (!signedIn) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [signedIn, load]);

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

  function signOut() {
    saveTeacherKey("");
    setSignedIn(false);
    setItems([]);
    setScripts([]);
    setStats(null);
    setDecided([]);
    setOpen(null);
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
            Signed in as {readTeacherRef() || "teacher"}.
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
              Mark a whole script ({scripts.length})
            </TabButton>
            <TabButton now={tab} name="queue" onPick={setTab}>
              Points the machine was unsure about ({items.length})
            </TabButton>
          </div>

          {tab === "scripts" ? (
            <ScriptList scripts={scripts} onOpen={setOpen} />
          ) : items.length === 0 ? (
            <Card>
              <p className="text-slate-600">
                Nothing is waiting here. Every point the machine was unsure about has been decided.
                To mark more, open a script on the other tab.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <ReviewCard
                  key={item.id}
                  item={item}
                  busy={deciding === item.id}
                  onDecide={(awarded, comment, peeked) =>
                    void decide(item, awarded, comment, peeked)
                  }
                />
              ))}
            </div>
          )}
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
}: {
  now: Tab;
  name: Tab;
  onPick: (name: Tab) => void;
  children: ReactNode;
}) {
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
