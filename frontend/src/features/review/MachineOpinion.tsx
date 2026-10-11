import { useState } from "react";

import type { ReviewItem } from "@/api/types";

function says(value: boolean | null): string {
  if (value === null) {
    return "did not judge";
  }
  return value ? "award" : "do not award";
}

/**
 * What the machine thought, hidden until the teacher asks for it.
 *
 * A teacher who reads "the AI says do not award" before deciding tends to agree with
 * it. That would quietly inflate the agreement figure the research reports, so the
 * teacher decides first and this stays shut.
 */
export function MachineOpinion({ item, open, onOpen }: Props) {
  const [showing, setShowing] = useState(false);
  const visible = open || showing;

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => {
          setShowing(true);
          onOpen();
        }}
        className="text-xs text-slate-400 underline decoration-dotted hover:text-slate-600"
      >
        Show what the computer said (decide first if you can)
      </button>
    );
  }

  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
        <span>
          chemistry checker: <strong>{says(item.checker_awarded)}</strong>
        </span>
        <span>
          AI judge: <strong>{says(item.ai_awarded)}</strong>
          {item.confidence !== null && ` (${Math.round(item.confidence * 100)}% sure)`}
        </span>
      </div>
      {item.machine_reason && <p className="mt-2 text-slate-500">{item.machine_reason}</p>}
    </div>
  );
}

interface Props {
  item: ReviewItem;
  open: boolean;
  onOpen: () => void;
}
