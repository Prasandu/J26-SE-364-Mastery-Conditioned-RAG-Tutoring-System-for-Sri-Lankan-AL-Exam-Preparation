import { useCallback, useState } from "react";

import { adminPaper, publishPaper, publishScheme } from "@/api/admin";
import { ApiError } from "@/api/client";
import type { GeneratedPaper, Question } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, SectionHeading } from "@/components/Card";
import { EmptyState, ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { useApi } from "@/hooks/useApi";
import { answerableQuestions } from "@/lib/questions";

interface Props {
  made: GeneratedPaper;
  onPublished: () => void;
}

/**
 * Reading a generated paper before anyone sits it.
 *
 * A model wrote these questions and their marking scheme. The service checks the
 * shape of them - five options, marks adding up - but nothing checks the chemistry,
 * and in testing a generated set contained a wrong answer key and two questions with
 * more than one correct option. So every question is ticked off by a person, and the
 * paper cannot be published until they all are.
 */
export function CheckPaper({ made, onPublished }: Props) {
  const load = useCallback(
    (signal: AbortSignal) => adminPaper(made.paper_id, signal),
    [made.paper_id],
  );
  const { data: paper, error, loading } = useApi(load, [made.paper_id]);

  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (loading) {
    return <Spinner label="Loading the generated paper..." />;
  }
  if (error || !paper) {
    return <ErrorBox message={error ?? "The paper could not be loaded"} />;
  }

  const questions = answerableQuestions(paper).map((item) => item.question);
  const allChecked = questions.length > 0 && questions.every((q) => checked.has(q.id));

  async function publish() {
    setPublishing(true);
    setProblem(null);
    try {
      // The scheme first: a paper cannot go out without a published scheme.
      await publishScheme(made.paper_id, made.scheme_version);
      await publishPaper(made.paper_id);
      onPublished();
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <SectionHeading hint={`written by ${made.written_by}`}>{made.title}</SectionHeading>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="good">{made.kept} questions kept</Badge>
          {made.dropped.length > 0 && <Badge tone="warn">{made.dropped.length} dropped</Badge>}
          <Badge>{made.shape.duration}</Badge>
          <Badge>{made.shape.marks} marks</Badge>
          <span className="text-slate-500">saved as a draft</span>
        </div>

        {made.dropped.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-slate-500">
              Why {made.dropped.length} were dropped
            </summary>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {made.dropped.map((reason) => (
                <li key={reason}>- {reason}</li>
              ))}
            </ul>
          </details>
        )}

        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          A model wrote these questions and the marking scheme. The chemistry has not been checked
          by anything. Read each one and tick it before publishing.
        </p>
      </Card>

      {questions.length === 0 ? (
        <EmptyState title="This paper has no questions" />
      ) : (
        <ol className="space-y-3">
          {questions.map((question, index) => (
            <QuestionCheck
              key={question.id}
              question={question}
              number={index + 1}
              checked={checked.has(question.id)}
              onToggle={(on) =>
                setChecked((current) => {
                  const next = new Set(current);
                  if (on) {
                    next.add(question.id);
                  } else {
                    next.delete(question.id);
                  }
                  return next;
                })
              }
            />
          ))}
        </ol>
      )}

      {problem && <ErrorBox message={problem} />}

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!allChecked || publishing} onClick={() => void publish()}>
            {publishing ? "Publishing..." : "Publish this paper"}
          </Button>
          <span className="text-sm text-slate-500">
            {allChecked
              ? "Students will be able to answer it."
              : `${checked.size} of ${questions.length} checked`}
          </span>
        </div>
      </Card>
    </div>
  );
}

function QuestionCheck({
  question,
  number,
  checked,
  onToggle,
}: {
  question: Question;
  number: number;
  checked: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <li>
      <Card className={checked ? "border-brand-200 bg-brand-50/40" : ""}>
        <div className="flex gap-3">
          <input
            type="checkbox"
            id={`q-${question.id}`}
            checked={checked}
            onChange={(event) => onToggle(event.target.checked)}
            aria-label={`Question ${number} checked`}
            className="mt-1 size-4 shrink-0 accent-brand-600"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-800">
              <span className="font-mono text-xs text-slate-400">{number}.</span> {question.text}
            </p>

            {question.options && (
              <ul className="mt-2 space-y-0.5">
                {question.options.map((option) => (
                  <li key={option.label} className="text-sm text-slate-600">
                    <span className="font-mono text-slate-400">({option.label})</span> {option.text}
                  </li>
                ))}
              </ul>
            )}

            <label
              htmlFor={`q-${question.id}`}
              className="mt-2 inline-block cursor-pointer text-xs text-brand-700"
            >
              {checked ? "Checked" : "I have read this and the chemistry is right"}
            </label>
          </div>
        </div>
      </Card>
    </li>
  );
}
