import { useEffect, useState } from "react";

import type { Topic } from "@/api/types";

interface Props {
  readonly topics: Topic[];
  readonly chosen: Set<string>;
  readonly onToggle: (codes: string[], on: boolean) => void;
}

/**
 * Pick broad topics first, then optionally choose specific parts in a small dialog.
 */
export function TopicWizard({ topics, chosen, onToggle }: Props) {
  const [openUnit, setOpenUnit] = useState<Topic | null>(null);
  const units = topics.filter((topic) => topic.parent_id === null);
  const childrenOf = (unit: Topic) => topics.filter((topic) => topic.parent_id === unit.id);

  function selectUnit(unit: Topic, on: boolean) {
    onToggle([unit.code], on);
    if (on && childrenOf(unit).length > 0) {
      setOpenUnit(unit);
    } else if (!on && openUnit?.id === unit.id) {
      setOpenUnit(null);
    }
  }

  return (
    <>
      <ul className="max-h-72 space-y-0.5 overflow-y-auto rounded-xl border border-slate-100 p-1.5">
        {units.map((unit) => {
          const levels = childrenOf(unit);
          const picked = levels.filter((level) => chosen.has(level.code)).length;
          return (
            <li key={unit.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
              <input
                type="checkbox"
                id={`unit-${unit.id}`}
                checked={chosen.has(unit.code)}
                onChange={(event) => selectUnit(unit, event.target.checked)}
                className="size-4 shrink-0 accent-brand-600"
              />
              <label htmlFor={`unit-${unit.id}`} className="flex-1 cursor-pointer text-sm">
                <span className="font-mono text-xs text-slate-400">{unit.code}</span> {unit.name}
              </label>
              {chosen.has(unit.code) && levels.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOpenUnit(unit)}
                  className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700 hover:bg-brand-100"
                >
                  {picked > 0 ? `${picked} selected` : "Choose specific parts"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {openUnit && (
        <SubtopicPopup
          unit={openUnit}
          levels={childrenOf(openUnit)}
          chosen={chosen}
          onToggle={onToggle}
          onClose={() => setOpenUnit(null)}
        />
      )}
    </>
  );
}

function SubtopicPopup({
  unit,
  levels,
  chosen,
  onToggle,
  onClose,
}: {
  unit: Topic;
  levels: Topic[];
  chosen: Set<string>;
  onToggle: (codes: string[], on: boolean) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Narrow down ${unit.name}`}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Optional focus</p>
            <p className="text-sm font-medium text-slate-800">Choose parts of {unit.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <div className="flex max-h-72 flex-wrap gap-1.5 overflow-y-auto">
          {levels.map((level) => {
            const picked = chosen.has(level.code);
            return (
              <button
                key={level.id}
                type="button"
                onClick={() => onToggle([level.code], !picked)}
                aria-pressed={picked}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  picked
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {level.name}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Done
        </button>
      </div>
    </div>
  );
}
