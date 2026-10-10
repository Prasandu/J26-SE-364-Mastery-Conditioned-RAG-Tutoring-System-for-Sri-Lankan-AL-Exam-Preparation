import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";

import { getPaper } from "@/api/papers";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { useApi } from "@/hooks/useApi";
import { paperSubtitle } from "@/lib/format";

import { QuestionTree } from "./QuestionTree";

export function PaperDetail() {
  const { paperId } = useParams();
  const id = Number(paperId);

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
        <Link to="/" className="text-sm text-teal-700 hover:underline">
          &larr; All papers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{paper.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{paperSubtitle(paper)}</p>
      </div>

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
