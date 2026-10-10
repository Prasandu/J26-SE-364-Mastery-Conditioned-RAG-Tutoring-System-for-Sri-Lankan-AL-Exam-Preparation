import { Badge } from "@/components/Badge";
import type { Answerable } from "@/lib/questions";
import { isMcq } from "@/lib/questions";
import { marks } from "@/lib/format";

import { McqOptions } from "./McqOptions";
import { WrittenAnswer } from "./WrittenAnswer";

interface Props {
  item: Answerable;
  chosen: string | null;
  text: string;
  disabled: boolean;
  onChoose: (option: string) => void;
  onWrite: (text: string) => void;
}

/** One answerable question: its wording, then the right kind of input. */
export function QuestionBlock({ item, chosen, text, disabled, onChoose, onWrite }: Props) {
  const { question, label } = item;

  return (
    <fieldset disabled={disabled} className="border-t border-slate-100 py-5 first:border-t-0">
      <legend className="sr-only">Question {label}</legend>

      <div className="flex gap-3">
        <span className="mt-0.5 w-12 shrink-0 font-mono text-sm text-teal-700">{label}</span>
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap text-sm text-slate-800">{question.text}</p>
          {question.max_marks !== null && (
            <div className="mt-2">
              <Badge tone="good">{marks(question.max_marks)}</Badge>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 pl-15">
        {isMcq(item) ? (
          <McqOptions question={question} chosen={chosen} disabled={disabled} onChoose={onChoose} />
        ) : (
          <WrittenAnswer
            value={text}
            questionId={question.id}
            disabled={disabled}
            onSave={onWrite}
          />
        )}
      </div>
    </fieldset>
  );
}
