import { useCallback } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { getPaper } from "@/api/papers";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { StartAttempt } from "@/features/attempt/StartAttempt";
import { useApi } from "@/hooks/useApi";
import { paperSubtitle } from "@/lib/format";

import type { MadeNote } from "./DroppedNote";
import { DroppedNote } from "./DroppedNote";
import { QuestionTree } from "./QuestionTree";

export function PaperDetail() {
  const { paperId } = useParams();
  const id = Number(paperId);
  // Set only when this page was reached by generating the paper (see PracticePage).
  const made = useLocation().state as MadeNote | null;

  const load = useCallback((signal: AbortSignal) => getPaper(id, signal), [id]);
  const { data: paper, error, loading } = useApi(load, [id]);

  if (!Number.isInteger(id)) {
    return <ErrorBox message={`"${paperId}" is not a paper id`} />;
  }
  if (loading) {
    return <Spinner label="Loading paper..." />;
  }
  if (error || !paper) {
    return <ErrorBox message={error ?? "Paper not found"} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/papers" className="text-sm text-brand-700 hover:underline">
          &larr; All papers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{paper.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{paperSubtitle(paper)}</p>
      </div>

      {made?.dropped && (
        <DroppedNote kept={made.kept} dropped={made.dropped} keptDespite={made.keptDespite} />
      )}

      <Card>
        <h2 className="font-medium">Answer this paper</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">
          Your answers save as you click. You can submit when you are ready.
        </p>
        <StartAttempt paperId={paper.id} />
      </Card>

      {paper.sections.map((section) => (
        <Card key={section.id}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-medium">
              Section {section.code} - {section.title}
            </h2>
            <Badge>{section.answer_mode}</Badge>
            {section.choose_count && <Badge tone="warn">answer any {section.choose_count}</Badge>}
            <span className="text-sm text-slate-400">
              {section.questions.length} {section.questions.length === 1 ? "question" : "questions"}
            </span>
          </div>

          {section.instructions && (
            <p className="mt-2 text-sm italic text-slate-500">{section.instructions}</p>
          )}

          <div className="mt-5">
            <QuestionTree questions={section.questions} />
          </div>
        </Card>
      ))}
    </div>
  );
}
