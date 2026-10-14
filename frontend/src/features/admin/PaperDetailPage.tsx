import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { adminPaper, copyPaper, listTopics } from "@/api/admin";
import { ApiError } from "@/api/client";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, SectionHeading } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { useApi } from "@/hooks/useApi";
import { when } from "@/lib/format";

import { AdminQuestionTree } from "./AdminQuestionTree";
import { SchemePanel } from "./SchemePanel";

const STATUS_TONE = { draft: "warn", published: "good" } as const;

/** One paper: its full question tree with editable topic tags, and every marking
 * scheme version with its validation and approval history. */
export function PaperDetailPage() {
  const { paperId } = useParams<{ paperId: string }>();
  const id = Number(paperId);
  const navigate = useNavigate();

  const loadPaper = useCallback((signal: AbortSignal) => adminPaper(id, signal), [id]);
  const { data: paper, error, loading, reload } = useApi(loadPaper, [id]);

  const loadTopics = useCallback((signal: AbortSignal) => listTopics(signal), []);
  const { data: topics } = useApi(loadTopics, []);

  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function correctThisPaper() {
    setCopying(true);
    setCopyError(null);
    try {
      const copy = await copyPaper(id);
      navigate(`/admin/papers/${copy.id}`);
    } catch (cause) {
      setCopyError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setCopying(false);
    }
  }

  if (loading) {
    return <Spinner label="Loading the paper..." />;
  }
  if (error || !paper) {
    return <ErrorBox message={error ?? "The paper could not be loaded"} />;
  }

  return (
    <div className="space-y-5">
      <Link to="/admin/papers" className="text-sm text-brand-700 hover:underline">
        &larr; All papers
      </Link>

      <Card>
        <SectionHeading hint={`${paper.kind}${paper.year ? ` - ${paper.year}` : ""}`}>
          {paper.title}
        </SectionHeading>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={STATUS_TONE[paper.status]}>{paper.status}</Badge>
          {paper.created_by && <Badge>made by {paper.created_by}</Badge>}
          <span className="text-slate-500">created {when(paper.created_at)}</span>
          {paper.published_at && (
            <span className="text-slate-500">- published {when(paper.published_at)}</span>
          )}
        </div>
        {paper.grounded_in.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Grounded in {paper.grounded_in.length} retrieved resource passage(s).
          </p>
        )}
        {paper.status === "draft" && (
          <Link
            to={`/admin/import?paperId=${id}`}
            className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline"
          >
            Import more questions for this paper &rarr;
          </Link>
        )}
        {paper.status === "published" && (
          <div className="mt-3">
            <p className="mb-2 text-xs text-slate-500">
              Published papers cannot be changed, so every mark already given stays traceable to
              exactly what a student saw. To fix something, copy it into a new draft instead.
            </p>
            <Button variant="secondary" disabled={copying} onClick={() => void correctThisPaper()}>
              {copying ? "Copying..." : "Copy to a new draft to correct it"}
            </Button>
            {copyError && (
              <div className="mt-2">
                <ErrorBox message={copyError} />
              </div>
            )}
          </div>
        )}
      </Card>

      <SchemePanel paperId={id} schemes={paper.marking_schemes} onChanged={reload} />

      <Card>
        <SectionHeading>Questions</SectionHeading>
        {paper.sections.map((section) => (
          <div key={section.id} className="mb-6 last:mb-0">
            <h3 className="mb-3 text-sm font-medium text-slate-700">
              Section {section.code} - {section.title}
            </h3>
            <AdminQuestionTree questions={section.questions} allTopics={topics ?? []} />
          </div>
        ))}
      </Card>
    </div>
  );
}
