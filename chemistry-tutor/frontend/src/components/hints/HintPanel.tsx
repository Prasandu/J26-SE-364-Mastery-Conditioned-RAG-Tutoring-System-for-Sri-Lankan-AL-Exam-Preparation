import type { HintResponse } from "../../types/question";

export function HintPanel({ hints }: { hints: HintResponse[] }) {
  if (hints.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {hints.map((h, i) => (
        <div key={i} className="rounded border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-700">
            Level {h.level} — {h.level_name}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{h.content}</p>
        </div>
      ))}
    </div>
  );
}
