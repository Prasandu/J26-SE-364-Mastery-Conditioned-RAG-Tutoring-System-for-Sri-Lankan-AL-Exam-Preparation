import type { Question } from "@/api/types";

interface Props {
  question: Question;
  chosen: string | null;
  disabled: boolean;
  onChoose: (option: string) => void;
}

/** The options of one MCQ, as clickable rows. */
export function McqOptions({ question, chosen, disabled, onChoose }: Props) {
  return (
    <div className="space-y-1">
      {(question.options ?? []).map((option) => {
        const picked = chosen === option.label;
        return (
          <label
            key={option.label}
            className={`flex items-start gap-3 rounded-lg px-3 py-2 text-sm transition ${
              picked ? "bg-teal-50 ring-1 ring-teal-400" : "hover:bg-slate-50"
            } ${disabled ? "cursor-default" : "cursor-pointer"}`}
          >
            <input
              type="radio"
              name={`question-${question.id}`}
              value={option.label}
              checked={picked}
              onChange={() => onChoose(option.label)}
              className="mt-0.5 accent-teal-600"
            />
            <span className="font-mono text-slate-400">({option.label})</span>
            <span className="text-slate-700">{option.text}</span>
          </label>
        );
      })}
    </div>
  );
}
