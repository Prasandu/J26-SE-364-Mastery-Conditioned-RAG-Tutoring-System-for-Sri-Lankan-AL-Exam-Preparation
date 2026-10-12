import { useState } from "react";

import { ApiError } from "@/api/client";
import { pointHistory } from "@/api/review";
import type { PointReview } from "@/api/types";
import { Badge } from "@/components/Badge";
import { when } from "@/lib/format";

/**
 * Every decision ever made on one marking point.
 *
 * Shown only after the teacher has decided. A second marker who reads what the first
 * one said tends to agree with it, which would spoil the agreement figure, so this
 * never appears on a card that is still waiting for a decision.
 */
export function DecisionHistory({ resultId }: { resultId: number }) {
  const [entries, setEntries] = useState<PointReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setEntries(await pointHistory(resultId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  if (entries === null) {
    return (
      <button
        type="button"
        disabled={loading}
        onClick={() => void load()}
        className="text-xs text-slate-400 underline decoration-dotted hover:text-slate-600"
      >
        {loading ? "Loading..." : "Who else decided this point?"}
        {error && <span className="ml-2 text-rose-600">{error}</span>}
      </button>
    );
  }

  if (entries.length <= 1) {
    return <p className="text-xs text-slate-400">No other teacher has decided this point.</p>;
  }

  return (
    <ol className="space-y-1 text-xs text-slate-500">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-slate-600">{entry.teacher_ref}</span>
          <span>{entry.awarded ? "awarded" : "did not award"}</span>
          <span className="text-slate-400">{when(entry.decided_at)}</span>
          {entry.saw_machine === null ? (
            <Badge>before blind review</Badge>
          ) : (
            entry.saw_machine && <Badge>looked first</Badge>
          )}
          {entry.comment && <span className="italic text-slate-400">{entry.comment}</span>}
        </li>
      ))}
    </ol>
  );
}
