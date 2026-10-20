import type { ReactNode } from "react";
import { useState } from "react";

import type { Question, Topic, TopicSuggestion } from "@/api/types";
import { Badge } from "@/components/Badge";
import { DataTable } from "@/components/DataTable";
import { fullLabel, marks } from "@/lib/format";

import { TopicTagEditor } from "./TopicTagEditor";

interface Props {
  readonly questions: Question[];
  readonly allTopics: Topic[];
  readonly parentLabel?: string;
  // Pending suggestions already fetched for the whole paper, keyed by question id -
  // shown right away instead of waiting for each question's own "Suggest" click.
  readonly pendingSuggestions?: Record<number, TopicSuggestion>;
}

/** The same tree as the public QuestionTree, with an editable topic tag on every leaf. */
export function AdminQuestionTree({ questions, allTopics, parentLabel = "", pendingSuggestions = {} }: Props) {
  // Topic edits are applied straight to local state, so the tree does not have to
  // reload the whole paper after every tag change.
  const [overrides, setOverrides] = useState<Record<number, string[]>>({});

  function topicsFor(question: Question): string[] {
    return overrides[question.id] ?? question.topics;
  }

  function render(items: Question[], prefix: string): ReactNode {
    return (
      <ol className="space-y-4">
        {items.map((question) => {
          const label = fullLabel(prefix, question.label);
          const isLeaf = question.sub_questions.length === 0;
          return (
            <li key={question.id}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 font-mono text-sm text-brand-700">{label}</span>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap text-sm text-slate-800">
                    {question.text || <span className="italic text-slate-400">(no text)</span>}
                  </p>

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

                  {question.table && (
                    <div className="overflow-x-auto">
                      <DataTable table={question.table} />
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {question.max_marks !== null && <Badge>{marks(question.max_marks)}</Badge>}
                    {isLeaf ? (
                      <TopicTagEditor
                        questionId={question.id}
                        topics={topicsFor(question)}
                        allTopics={allTopics}
                        initialSuggestion={pendingSuggestions[question.id]}
                        onChanged={(next) =>
                          setOverrides((current) => ({ ...current, [question.id]: next }))
                        }
                      />
                    ) : (
                      topicsFor(question).map((code) => <Badge key={code}>{code}</Badge>)
                    )}
                  </div>

                  {question.sub_questions.length > 0 && (
                    <div className="mt-4 border-l border-slate-200 pl-4">
                      {render(question.sub_questions, label)}
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

  return <>{render(questions, parentLabel)}</>;
}
