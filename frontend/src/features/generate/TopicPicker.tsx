import { useState } from "react";

import type { Topic } from "@/api/types";

interface Props {
  topics: Topic[];
  chosen: Set<string>;
  onToggle: (codes: string[], on: boolean) => void;
}

/**
 * The syllabus as a tree: units, and the competency levels inside them.
 *
 * Ticking a unit means the whole unit. Ticking some of its levels narrows it to
 * those, which is what a teacher wants when setting practice on one idea.
 */
export function TopicPicker({ topics, chosen, onToggle }: Props) {
  const units = topics.filter((topic) => topic.parent_id === null);
  const childrenOf = (unit: Topic) => topics.filter((topic) => topic.parent_id === unit.id);

  return (
    <ul className="space-y-2">
      {units.map((unit) => (
        <Unit
          key={unit.id}
          unit={unit}
          levels={childrenOf(unit)}
          chosen={chosen}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}

function Unit({
  unit,
  levels,
  chosen,
  onToggle,
}: {
  unit: Topic;
  levels: Topic[];
  chosen: Set<string>;
  onToggle: (codes: string[], on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const picked = levels.filter((level) => chosen.has(level.code)).length;
  const whole = chosen.has(unit.code);

  return (
    <li className="rounded-2xl border border-slate-200 bg-white/70">
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          id={`unit-${unit.id}`}
          checked={whole}
          onChange={(event) => onToggle([unit.code], event.target.checked)}
          className="size-4 accent-brand-600"
        />
        <label htmlFor={`unit-${unit.id}`} className="flex-1 cursor-pointer text-sm">
          <span className="font-mono text-xs text-slate-400">{unit.code}</span>{" "}
          <span className="font-medium">{unit.name}</span>
        </label>

        {picked > 0 && (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
            {picked} chosen
          </span>
        )}

        {levels.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="rounded-full px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
          >
            {open ? "Hide" : `${levels.length} parts`}
          </button>
        )}
      </div>

      {open && levels.length > 0 && (
        <ul className="border-t border-slate-100 px-4 py-2">
          {levels.map((level) => (
            <li key={level.id} className="flex items-start gap-3 py-1.5">
              <input
                type="checkbox"
                id={`level-${level.id}`}
                checked={chosen.has(level.code)}
                onChange={(event) => onToggle([level.code], event.target.checked)}
                className="mt-0.5 size-4 accent-brand-600"
              />
              <label
                htmlFor={`level-${level.id}`}
                className="cursor-pointer text-sm text-slate-600"
              >
                <span className="font-mono text-xs text-slate-400">{level.code}</span> {level.name}
              </label>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
