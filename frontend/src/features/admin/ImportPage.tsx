import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { appendSchemeQuestionsFromExtraction, createSchemeFromExtraction, extractPdf } from "@/api/extract";
import { ApiError } from "@/api/client";
import type { ExtractResult, SchemeSource } from "@/api/types";
import { Button } from "@/components/Button";
import { Card, SectionHeading } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { FileField } from "@/components/FileField";
import { PdfViewer } from "@/components/PdfViewer";

/**
 * Upload a scanned marking scheme PDF, review what the model read, then create the
 * next scheme version from it for an existing paper.
 *
 * Past papers themselves are no longer OCR'd - see "Past paper (PDF)", which stores
 * the real exam PDF instead of transcribing it. This page now only ever reads a
 * marking scheme, the one thing that still needs OCR (or manual entry), since
 * automated marking needs its structured points, which only OCR-into-JSON or typing
 * them in can produce.
 */
export function ImportPage() {
  const [searchParams] = useSearchParams();
  const prefillPaperId = searchParams.get("paperId") ?? undefined;
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [questionsText, setQuestionsText] = useState("");
  const [mcqAnswersText, setMcqAnswersText] = useState("");
  const [mcqMarksRead, setMcqMarksRead] = useState<number | null>(null);

  function onExtracted(outcome: ExtractResult) {
    setResult(outcome);
    setQuestionsText(JSON.stringify(outcome.extracted.questions, null, 2));
    setMcqAnswersText(JSON.stringify(outcome.extracted.mcq_answers ?? [], null, 2));
    setMcqMarksRead(outcome.extracted.mcq_marks ?? null);
  }

  function startOver() {
    setResult(null);
    setQuestionsText("");
    setMcqAnswersText("");
    setMcqMarksRead(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Import a marking scheme</h1>
        <p className="mt-1 text-sm text-slate-500">
          A scanned marking scheme, read by the vision model into a draft you check before anything
          is created - nothing is saved until you submit the reviewed draft below.
        </p>
      </div>

      {!result && <ExtractForm onExtracted={onExtracted} />}

      {result && (
        <>
          <ExtractSummary result={result} onStartOver={startOver} />
          <ReviewAndSubmit
            questionsText={questionsText}
            mcqAnswersText={mcqAnswersText}
            mcqMarksRead={mcqMarksRead}
            onQuestionsChange={setQuestionsText}
            onMcqAnswersChange={setMcqAnswersText}
            prefillPaperId={prefillPaperId}
          />
        </>
      )}
    </div>
  );
}

function ExtractForm({ onExtracted }: { readonly onExtracted: (result: ExtractResult) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [problemDetails, setProblemDetails] = useState<string[]>([]);

  // A local preview of the chosen file, never uploaded anywhere - just so the
  // admin can see which page numbers to type into "Pages" below, instead of
  // guessing from the printed page or trial and error.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setProblem("Choose a PDF first");
      setProblemDetails([]);
      return;
    }
    setBusy(true);
    setProblem(null);
    setProblemDetails([]);
    try {
      const result = await extractPdf({
        file,
        pages: pages.trim(),
        kind: "scheme",
        hint: hint.trim() || undefined,
      });
      onExtracted(result);
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : String(cause));
      setProblemDetails(cause instanceof ApiError ? cause.details : []);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionHeading>1. Read the pages</SectionHeading>
      <form onSubmit={submit} className="space-y-4">
        <FileField id="import-file" label="Scanned PDF" accept="application/pdf" file={file} onChange={setFile} />

        {previewUrl && (
          <div className="space-y-1">
            <p className="text-sm text-slate-600">
              Preview - each page is labelled, so you know what to put in "Pages" below.
            </p>
            <div className="h-[60vh]">
              <PdfViewer fileUrl={previewUrl} />
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="import-pages" className="block text-sm text-slate-600">
              Pages <span className="text-xs text-slate-400">e.g. "2-5" or "1,3,5"</span>
            </label>
            <input
              id="import-pages"
              required
              value={pages}
              onChange={(event) => setPages(event.target.value)}
              placeholder="1-4"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="import-hint" className="block text-sm text-slate-600">
              Hint <span className="text-xs text-slate-400">optional, e.g. "2024 Paper I"</span>
            </label>
            <input
              id="import-hint"
              value={hint}
              onChange={(event) => setHint(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>

        <Button type="submit" disabled={busy}>
          {busy ? "Reading..." : "Read these pages"}
        </Button>

        {problem && <ErrorBox message={problem} details={problemDetails} />}
      </form>
    </Card>
  );
}

function ExtractSummary({
  result,
  onStartOver,
}: {
  readonly result: ExtractResult;
  readonly onStartOver: () => void;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading>2. What was read</SectionHeading>
        <Button variant="secondary" onClick={onStartOver}>
          Start over with a different file
        </Button>
      </div>

      {result.failed.length > 0 && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Pages {result.failed.map((entry) => entry.pages.join("-")).join(", ")} could not be read
          ({result.failed[0].error}). Re-run the import for just those pages and merge the questions by
          hand below, or accept what was read.
        </p>
      )}

      {result.failed.length === 0 &&
        result.extracted.questions.length === 0 &&
        (result.extracted.mcq_answers ?? []).length === 0 && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            {result.pages_read.length} page(s) were read by {result.model} without an error, but nothing
            was extracted from any of them - that almost never means the pages were genuinely blank. It
            usually means this model could not make sense of the scan (a common gap for a newly-tried
            model). Try a different, known-working model, or re-run just one page to confirm.
          </p>
        )}

      {result.notes.length > 0 && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          <p className="font-medium text-slate-700">The model flagged, check these:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {result.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function ReviewAndSubmit({
  questionsText,
  mcqAnswersText,
  mcqMarksRead,
  onQuestionsChange,
  onMcqAnswersChange,
  prefillPaperId,
}: {
  readonly questionsText: string;
  readonly mcqAnswersText: string;
  readonly mcqMarksRead: number | null;
  readonly onQuestionsChange: (text: string) => void;
  readonly onMcqAnswersChange: (text: string) => void;
  readonly prefillPaperId?: string;
}) {
  return (
    <Card>
      <SectionHeading>3. Review and correct</SectionHeading>
      <p className="text-sm text-slate-500">
        Fix anything the model misread directly in the JSON below - nothing is saved until you submit
        it in the next step.
      </p>

      {hasEntries(questionsText) && (
        <div className="mt-3 space-y-1">
          <label htmlFor="import-questions" className="block text-sm text-slate-600">
            Questions
          </label>
          <textarea
            id="import-questions"
            value={questionsText}
            onChange={(event) => onQuestionsChange(event.target.value)}
            rows={14}
            spellCheck={false}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none"
          />
        </div>
      )}

      {hasEntries(mcqAnswersText) && (
        <div className="mt-3 space-y-1">
          <label htmlFor="import-mcq-answers" className="block text-sm text-slate-600">
            MCQ answer key
          </label>
          <textarea
            id="import-mcq-answers"
            value={mcqAnswersText}
            onChange={(event) => onMcqAnswersChange(event.target.value)}
            rows={6}
            spellCheck={false}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none"
          />
        </div>
      )}

      {!hasEntries(questionsText) && !hasEntries(mcqAnswersText) && (
        <p className="mt-3 text-sm text-slate-500">Nothing was found to review on this page.</p>
      )}

      <CreateSchemeForm
        questionsText={questionsText}
        mcqAnswersText={mcqAnswersText}
        mcqMarksRead={mcqMarksRead}
        prefillPaperId={prefillPaperId}
      />
    </Card>
  );
}

function parseJsonArray(text: string, label: string): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array`);
  }
  return parsed as Record<string, unknown>[];
}

function hasEntries(jsonArrayText: string): boolean {
  try {
    const parsed: unknown = JSON.parse(jsonArrayText);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

// Every paper a marking scheme is imported for today has exactly one section,
// always coded "I" (see app/services/papers.py's create_past_paper_shell) - so
// this is no longer something the admin needs to type in.
const SECTION_CODE = "I";

function CreateSchemeForm({
  questionsText,
  mcqAnswersText,
  mcqMarksRead,
  prefillPaperId,
}: {
  readonly questionsText: string;
  readonly mcqAnswersText: string;
  readonly mcqMarksRead: number | null;
  readonly prefillPaperId?: string;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [paperId, setPaperId] = useState(prefillPaperId ?? "");
  const [version, setVersion] = useState("");
  const [mcqMarks, setMcqMarks] = useState(mcqMarksRead !== null ? String(mcqMarksRead) : "");
  const [source, setSource] = useState<SchemeSource>("official");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [problemDetails, setProblemDetails] = useState<string[]>([]);

  const hasMcqAnswers = hasEntries(mcqAnswersText);
  // The vision model already read the marks-per-question off the page itself
  // (see extractor.py's SCHEME_PROMPT) - this box only appears as a fallback, for
  // the rare page that never states it anywhere.
  const needsMcqMarks = hasMcqAnswers && mcqMarksRead === null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (needsMcqMarks && !mcqMarks.trim()) {
      setProblem("The page didn't state the marks per MCQ - enter it above");
      setProblemDetails([]);
      return;
    }
    setBusy(true);
    setProblem(null);
    setProblemDetails([]);
    try {
      const questions = parseJsonArray(questionsText, "Questions");
      const mcqAnswers = parseJsonArray(mcqAnswersText, "MCQ answer key");
      if (mode === "existing") {
        await appendSchemeQuestionsFromExtraction(Number(paperId), Number(version), {
          questions,
          mcqAnswers,
          sectionCode: SECTION_CODE,
          mcqMarks: mcqMarks.trim() ? Number(mcqMarks) : undefined,
        });
      } else {
        await createSchemeFromExtraction(Number(paperId), {
          questions,
          mcqAnswers,
          sectionCode: SECTION_CODE,
          mcqMarks: mcqMarks.trim() ? Number(mcqMarks) : undefined,
          source,
        });
      }
      navigate(`/admin/papers/${paperId}`);
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : (cause as Error).message);
      setProblemDetails(cause instanceof ApiError ? cause.details : []);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
      <p className="text-sm font-medium text-slate-700">Scheme details</p>

      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={mode === "new"}
            onChange={() => setMode("new")}
            className="accent-brand-600"
          />
          Create a new version
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={mode === "existing"}
            onChange={() => setMode("existing")}
            className="accent-brand-600"
          />
          Add to an existing draft version
        </label>
      </div>

      {mode === "existing" && (
        <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">
          For resuming an import split across several sessions - the entries above are added into
          that version alongside whatever is already marked there.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <LabelledInput id="scheme-paper-id" label="Paper id" value={paperId} onChange={setPaperId} type="number" required />
        {mode === "existing" && (
          <LabelledInput id="scheme-version" label="Version" hint="the draft to add into" value={version} onChange={setVersion} type="number" required />
        )}
        {needsMcqMarks && (
          <LabelledInput
            id="scheme-mcq-marks"
            label="Marks per MCQ"
            hint="the page didn't state this"
            value={mcqMarks}
            onChange={setMcqMarks}
            type="number"
            required
          />
        )}
        {mode === "new" && (
          <div className="space-y-1">
            <label htmlFor="scheme-source" className="block text-sm text-slate-600">
              Source
            </label>
            <select
              id="scheme-source"
              value={source}
              onChange={(event) => setSource(event.target.value as SchemeSource)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="official">Official</option>
              <option value="teacher">Teacher-written</option>
            </select>
          </div>
        )}
      </div>

      <Button type="submit" disabled={busy}>
        {busy ? "Saving..." : mode === "existing" ? "Add these entries" : "Create this scheme version"}
      </Button>

      {problem && <ErrorBox message={problem} details={problemDetails} />}
    </form>
  );
}

function LabelledInput({
  id,
  label,
  hint,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: string;
  readonly required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm text-slate-600">
        {label}
        {hint && <span className="ml-1.5 text-xs text-slate-400">{hint}</span>}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
      />
    </div>
  );
}
