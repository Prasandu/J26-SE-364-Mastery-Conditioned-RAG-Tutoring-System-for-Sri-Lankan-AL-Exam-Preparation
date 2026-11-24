import type { Question } from "@/api/types";

interface Props {
  question: Question;
  chosen: string | null;
  disabled: boolean;
  // Used only when the question has no options of its own - a past paper's MCQ
  // question created from its answer key names no option text, only which one is
  // correct, so the real wording is never in reach of this page (see
  // app/lib/questions.ts's optionLabels); the student reads it off the PDF shown
  // alongside instead, and picks the matching number here.
  fallbackLabels: string[];
  // null clears the answer - clicking the already-chosen option again.
  onChoose: (option: string | null) => void;
}

/** The options of one MCQ: its own, as clickable rows with their wording - or, if
 * it has none, a plain numbered picker from fallbackLabels. */
export function McqOptions({ question, chosen, disabled, fallbackLabels, onChoose }: Props) {
  if (!question.options?.length) {
    return (
      <div className="flex flex-wrap gap-2">
        {fallbackLabels.map((label) => {
          const picked = chosen === label;
          return (
            <button
              key={label}
              type="button"
              disabled={disabled}
              aria-pressed={picked}
              aria-label={`Option ${label}`}
              onClick={() => onChoose(picked ? null : label)}
              className={`size-9 rounded-full border text-sm transition ${
                picked
                  ? "border-brand-600 bg-brand-600 font-medium text-white"
                  : "border-slate-300 text-slate-600 hover:border-brand-400 hover:bg-brand-50"
              } ${disabled ? "cursor-default" : "cursor-pointer"}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {question.options.map((option) => {
        const picked = chosen === option.label;
        return (
          <label
            key={option.label}
            className={`flex items-start gap-3 rounded-lg px-3 py-2 text-sm transition ${
              picked ? "bg-brand-50 ring-1 ring-brand-400" : "hover:bg-slate-50"
            } ${disabled ? "cursor-default" : "cursor-pointer"}`}
          >
            <input
              type="radio"
              name={`question-${question.id}`}
              value={option.label}
              checked={picked}
              // A native radio never un-checks itself by clicking the checked one
              // again, so that case is handled here instead of onChange, which
              // would not fire for it.
              onClick={() => picked && onChoose(null)}
              onChange={() => onChoose(option.label)}
              className="mt-0.5 accent-brand-600"
            />
            <span className="font-mono text-slate-400">({option.label})</span>
            <span className="text-slate-700">{option.text}</span>
          </label>
        );
      })}
    </div>
  );
}
