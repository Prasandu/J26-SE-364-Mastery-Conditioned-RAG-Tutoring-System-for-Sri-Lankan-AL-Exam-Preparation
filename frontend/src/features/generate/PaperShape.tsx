import type { Counts, Rates } from "@/api/types";
import { ORDER, shapeFrom } from "@/lib/shape";

export function PaperShape({ counts, rates }: { counts: Counts; rates: Rates }) {
  const shape = shapeFrom(counts, rates);

  return (
    <div className="rounded-2xl bg-brand-50/70 p-5">
      <dl className="grid grid-cols-3 gap-4 text-center">
        <Figure label="Questions" value={String(shape.questions)} />
        <Figure
          label="Marks"
          value={shape.marks % 1 === 0 ? String(shape.marks) : shape.marks.toFixed(1)}
        />
        <Figure label="Time allowed" value={shape.duration} />
      </dl>

      {shape.questions > 0 && (
        <ul className="mt-4 space-y-1 border-t border-brand-200/60 pt-3 text-xs text-slate-600">
          {ORDER.filter(({ key }) => counts[key] > 0).map(({ key, label, mode }) => (
            <li key={key} className="flex justify-between">
              <span>
                {counts[key]} x {label.toLowerCase()}
              </span>
              <span className="tabular-nums">
                {/* Not rounded to whole minutes: one multiple choice is 2.4, and
                 * showing "2 min" made the row disagree with the total above it. */}
                {+(counts[key] * (rates.minutes_per_question[mode] ?? 0)).toFixed(1)} min
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-brand-700/70">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
