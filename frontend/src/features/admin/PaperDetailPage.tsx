import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  adminPaper,
  appendQuestions,
  classifyTopics,
  copyPaper,
  deletePaper,
  listTopics,
  listTopicSuggestions,
  publishPaper,
} from "@/api/admin";
import { ApiError } from "@/api/client";
import type { Question, Section, TopicSuggestion } from "@/api/types";
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

function leafQuestionIds(questions: Question[]): number[] {
  return questions.flatMap((question) =>
    question.sub_questions.length > 0 ? leafQuestionIds(question.sub_questions) : [question.id]
  );
}

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

  const loadSuggestions = useCallback(
    (signal: AbortSignal) => listTopicSuggestions("pending", signal),
    []
  );
  const { data: pendingSuggestions, reload: reloadSuggestions } = useApi(loadSuggestions, []);
  const suggestionsByQuestion = useMemo(
    () => Object.fromEntries((pendingSuggestions ?? []).map((s) => [s.question_id, s])),
    [pendingSuggestions]
  ) as Record<number, TopicSuggestion>;

  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [suggestingAll, setSuggestingAll] = useState(false);
  const [suggestAllResult, setSuggestAllResult] = useState<string | null>(null);

  async function suggestTopicsForAllQuestions() {
    if (!paper) return;
    setSuggestingAll(true);
    setSuggestAllResult(null);
    try {
      const ids = paper.sections.flatMap((section) => leafQuestionIds(section.questions));
      const created = await classifyTopics(ids);
      if (created.length > 0) {
        reloadSuggestions();
        setSuggestAllResult(`${created.length} suggestion(s) ready for review below.`);
      } else {
        setSuggestAllResult(
          "Nothing new to suggest: every question already has a topic or a pending suggestion."
        );
      }
    } catch (cause) {
      setSuggestAllResult(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setSuggestingAll(false);
    }
  }

  async function publishThisPaper() {
    setPublishing(true);
    setPublishError(null);
    try {
      await publishPaper(id);
      reload();
    } catch (cause) {
      setPublishError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setPublishing(false);
    }
  }

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

  async function removeThisPaper() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deletePaper(id);
      navigate("/admin/papers");
    } catch (cause) {
      setDeleteError(cause instanceof ApiError ? cause.message : String(cause));
      setDeleting(false);
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
        {paper.status === "draft" && (
          <div className="mt-3 flex items-center gap-2">
            <Button disabled={publishing} onClick={() => void publishThisPaper()}>
              {publishing ? "Publishing..." : "Publish this paper"}
            </Button>
            {confirmingDelete ? (
              <>
                <span className="text-xs text-rose-700">Delete this paper and all its questions?</span>
                <Button variant="secondary" disabled={deleting} onClick={() => void removeThisPaper()}>
                  {deleting ? "Deleting..." : "Confirm"}
                </Button>
                <Button variant="ghost" disabled={deleting} onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
                Delete this paper
              </Button>
            )}
          </div>
        )}
        {publishError && (
          <div className="mt-2">
            <ErrorBox message={publishError} />
          </div>
        )}
        {deleteError && (
          <div className="mt-2">
            <ErrorBox message={deleteError} />
          </div>
        )}
      </Card>

      <SchemePanel paperId={id} schemes={paper.marking_schemes} onChanged={reload} />

      <Card>
        <SectionHeading>Questions</SectionHeading>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={suggestingAll}
            onClick={() => void suggestTopicsForAllQuestions()}
          >
            {suggestingAll ? "Asking the model..." : "✨ Suggest topics for all questions"}
          </Button>
          {suggestAllResult && <span className="text-xs text-slate-500">{suggestAllResult}</span>}
        </div>
        {paper.sections.map((section) => (
          <div key={section.id} className="mb-6 last:mb-0">
            <h3 className="mb-3 text-sm font-medium text-slate-700">
              Section {section.code} - {section.title}
            </h3>
            {section.questions.length === 0 && (
              <p className="mb-3 text-sm text-slate-500">No questions yet.</p>
            )}
            <AdminQuestionTree
              questions={section.questions}
              allTopics={topics ?? []}
              pendingSuggestions={suggestionsByQuestion}
            />
            {paper.status === "draft" && (
              <AddQuestionForm paperId={id} section={section} hasPdf={paper.has_pdf} onAdded={reload} />
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

/** A label and marks (and, for a past paper's own PDF, the page it starts on) - no
 * wording, since that comes from the question bank's text or the paper's own PDF.
 * Reuses the same "add more questions" route the OCR-import flow resumes with. */
function AddQuestionForm({
  paperId,
  section,
  hasPdf,
  onAdded,
}: {
  readonly paperId: number;
  readonly section: Section;
  readonly hasPdf: boolean;
  readonly onAdded: () => void;
}) {
  const [label, setLabel] = useState("");
  const [maxMarks, setMaxMarks] = useState("");
  const [startPage, setStartPage] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await appendQuestions(paperId, section.code, [
        {
          label: label.trim(),
          max_marks: maxMarks.trim() ? Number(maxMarks) : null,
          start_page: hasPdf && startPage.trim() ? Number(startPage) : null,
        },
      ]);
      setLabel("");
      setMaxMarks("");
      setStartPage("");
      onAdded();
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
      <div className="space-y-1">
        <label htmlFor={`add-q-label-${section.id}`} className="block text-xs text-slate-500">
          Label
        </label>
        <input
          id={`add-q-label-${section.id}`}
          required
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder='e.g. "1" or "(a)"'
          className="w-28 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`add-q-marks-${section.id}`} className="block text-xs text-slate-500">
          Max marks
        </label>
        <input
          id={`add-q-marks-${section.id}`}
          type="number"
          value={maxMarks}
          onChange={(event) => setMaxMarks(event.target.value)}
          className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
        />
      </div>
      {hasPdf && (
        <div className="space-y-1">
          <label htmlFor={`add-q-page-${section.id}`} className="block text-xs text-slate-500">
            Starts on page
          </label>
          <input
            id={`add-q-page-${section.id}`}
            type="number"
            value={startPage}
            onChange={(event) => setStartPage(event.target.value)}
            className="w-28 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
      )}
      <Button type="submit" variant="secondary" disabled={busy}>
        {busy ? "Adding..." : "Add question"}
      </Button>
      {problem && (
        <div className="basis-full">
          <ErrorBox message={problem} />
        </div>
      )}
    </form>
  );
}
