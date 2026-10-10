import type { Question } from "@/api/types";
import { Badge } from "@/components/Badge";
import { fullLabel, marks } from "@/lib/format";

interface Props {
  questions: Question[];
  parentLabel?: string;
}

/** Shows a question and its sub-questions, indented one level per depth. */
export function QuestionTree({ questions, parentLabel = "" }: Props) {
  return (
    <ol className="space-y-4">
      {questions.map((question) => {
        const label = fullLabel(parentLabel, question.label);
        return (
          <li key={question.id}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 font-mono text-sm text-teal-700">{label}</span>
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap text-sm text-slate-800">{question.text}</p>

                {question.options && (
                  <ul className="mt-2 space-y-1">
                    {question.options.map((option) => (
                      <li key={option.label} className="flex gap-2 text-sm text-slate-600">
                        <span className="font-mono text-slate-400">({option.label})</span>
                        <span>{option.text}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {(question.max_marks !== null || question.topics.length > 0) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {question.max_marks !== null && (
                      <Badge tone="good">{marks(question.max_marks)}</Badge>
                    )}
                    {question.topics.map((topic) => (
                      <Badge key={topic}>{topic}</Badge>
                    ))}
                  </div>
                )}

                {question.sub_questions.length > 0 && (
                  <div className="mt-4 border-l border-slate-200 pl-4">
                    <QuestionTree questions={question.sub_questions} parentLabel={label} />
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
