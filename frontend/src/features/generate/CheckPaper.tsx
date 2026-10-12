import { useCallback, useState } from "react";

import {
  adminPaper,
  approveScheme,
  publishPaper,
  publishScheme,
  schemeSummaries,
} from "@/api/admin";
import { ApiError } from "@/api/client";
import type { GeneratedPaper, Question, SchemeStatus } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, SectionHeading } from "@/components/Card";
import { EmptyState, ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { useApi } from "@/hooks/useApi";
import { answerableQuestions } from "@/lib/questions";
import { readAdminRef, saveAdminRef } from "@/lib/teacher";

interface Props {
  made: GeneratedPaper;
  onPublished: () => void;
}

const DONE_STATUSES: SchemeStatus[] = ["approved", "published", "retired"];

/**
 * Reading a generated paper before anyone sits it.
 *
 * A model wrote these questions and their marking scheme. The backend already ran
 * them through deterministic checks (marks adding up, units, equation balance,
 * notation) before this screen ever loads - `made.checked_by` says which ones, and
 * a scheme the checks rejected never gets this far. What the checks could not settle
 * is listed under "Needs a teacher's judgement" below, and nothing here hides it.
 *
 * Code cannot judge the chemistry itself, so a person still reads every question and
 * the paper cannot be published until they all are and someone has put their name to
 * approving the scheme.
 */
export function CheckPaper({ made, onPublished }: Props) {
  const loadPaper = useCallback(
    (signal: AbortSignal) => adminPaper(made.paper_id, signal),
    [made.paper_id],
  );
  const { data: paper, error, loading } = useApi(loadPaper, [made.paper_id]);

  const loadScheme = useCallback(
    async (signal: AbortSignal) => {
      const schemes = await schemeSummaries(made.paper_id, signal);
      const mine = schemes.find((s) => s.version === made.scheme_version);
      if (!mine) {
        throw new Error("The marking scheme for this paper could not be found");
      }
      return mine;
    },
    [made.paper_id, made.scheme_version],
  );
  const {
    data: scheme,
    error: schemeError,
    loading: schemeLoading,
  } = useApi(loadScheme, [made.paper_id, made.scheme_version]);

  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [approver, setApprover] = useState(readAdminRef());
  const [publishing, setPublishing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (loading || schemeLoading) {
    return <Spinner label="Loading the generated paper..." />;
  }
  if (error || !paper) {
    return <ErrorBox message={error ?? "The paper could not be loaded"} />;
  }
  if (schemeError || !scheme) {
    return <ErrorBox message={schemeError ?? "The marking scheme could not be loaded"} />;
  }

  const questions = answerableQuestions(paper).map((item) => item.question);
  const allChecked = questions.length > 0 && checked.size === questions.length;
  const alreadyApproved = DONE_STATUSES.includes(scheme.status);
  const canPublish = allChecked && (alreadyApproved || approver.trim() !== "");

  async function publish() {
    setPublishing(true);
    setProblem(null);
    try {
      if (!alreadyApproved) {
        const name = approver.trim();
        saveAdminRef(name);
        // Recorded by name: a generated scheme stays visibly unapproved until a
        // person takes responsibility for it, however many automated checks passed.
        await approveScheme(made.paper_id, made.scheme_version, name);
      }
      await publishScheme(made.paper_id, made.scheme_version);
      await publishPaper(made.paper_id);
      onPublished();
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setPublishing(false);
    }
  }

  if (scheme.status === "validation_failed") {
    return (
      <Card>
        <SectionHeading hint="checked automatically before you ever saw this screen">
          The checks found a problem with {made.title}
        </SectionHeading>
        <p className="text-sm text-slate-600">
          The marking scheme failed validation, so it cannot be published. Go back and generate the
          paper again - a different attempt usually avoids the same mistake.
        </p>
        {made.dropped.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-rose-700">
            {made.dropped.map((reason) => (
              <li key={reason}>- {reason}</li>
            ))}
          </ul>
        )}
      </Card>
    );
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

        <p className="mt-3 text-xs text-slate-500">
          Automated checks: {made.checked_by.join(", ") || "none"} ({made.attempts}{" "}
          {made.attempts === 1 ? "attempt" : "attempts"} to write enough usable questions)
        </p>

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

        {made.needs_teacher.length > 0 && (
          <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">Needs a teacher's judgement</p>
            <p className="mt-1 text-amber-800">
              Nothing could prove these right or wrong by code. Read them with the question below.
            </p>
            <ul className="mt-2 space-y-1">
              {made.needs_teacher.map((finding) => (
                <li key={finding}>- {finding}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          A model wrote these questions and the marking scheme. The checks above catch preventable
          mistakes - they do not prove the chemistry is correct. Read each one and tick it before
          publishing.
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
        <div className="space-y-3">
          {!alreadyApproved && (
            <div>
              <label htmlFor="approver-name" className="block text-sm text-slate-600">
                Approved by (your name)
              </label>
              <input
                id="approver-name"
                value={approver}
                onChange={(event) => setApprover(event.target.value)}
                maxLength={64}
                placeholder="T01"
                className="mt-1 w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-slate-500">
                Kept with the scheme for good, so it stays clear who signed off a machine-written
                marking scheme.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!canPublish || publishing} onClick={() => void publish()}>
              {publishing ? "Publishing..." : "Approve and publish this paper"}
            </Button>
            <span className="text-sm text-slate-500">
              {allChecked
                ? canPublish
                  ? "Students will be able to answer it."
                  : "Enter your name to approve the scheme."
                : `${checked.size} of ${questions.length} checked`}
            </span>
          </div>
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
