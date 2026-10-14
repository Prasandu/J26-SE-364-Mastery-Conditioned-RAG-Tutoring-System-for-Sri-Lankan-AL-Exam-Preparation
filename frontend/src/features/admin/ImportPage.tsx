import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  appendPaperQuestionsFromExtraction,
  appendSchemeQuestionsFromExtraction,
  createPaperFromExtraction,
  createSchemeFromExtraction,
  extractPdf,
} from "@/api/extract";
import { ApiError } from "@/api/client";
import type { AnswerMode, ExtractResult, SchemeSource } from "@/api/types";
import { Button } from "@/components/Button";
import { Card, SectionHeading } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";

type Kind = "paper" | "scheme";

/**
 * Upload a scanned PDF, review what the model read, then create the paper or the
 * next scheme version from it.
 *
 * One section per import - a paper with several sections (e.g. Paper I and Paper
 * II) needs one import per section, same as the CLI's own pipeline treats each
 * section as its own draft. A multi-file, many-section import is still better done
 * with app/import_pdf.py's plan file (see docs/admin-guide.md).
 */
export function ImportPage() {
  const [searchParams] = useSearchParams();
  const prefillPaperId = searchParams.get("paperId") ?? undefined;
  const [kind, setKind] = useState<Kind>("paper");
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [questionsText, setQuestionsText] = useState("");
  const [mcqAnswersText, setMcqAnswersText] = useState("");

  function onExtracted(outcome: ExtractResult) {
    setResult(outcome);
    setQuestionsText(JSON.stringify(outcome.extracted.questions, null, 2));
    setMcqAnswersText(JSON.stringify(outcome.extracted.mcq_answers ?? [], null, 2));
  }

  function startOver() {
    setResult(null);
    setQuestionsText("");
    setMcqAnswersText("");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Import a PDF</h1>
        <p className="mt-1 text-sm text-slate-500">
          A scanned past paper or marking scheme, read by the vision model into a draft you check
          before anything is created - nothing is saved until you submit the reviewed draft below.
        </p>
      </div>

      {!result && <ExtractForm kind={kind} onKindChange={setKind} onExtracted={onExtracted} />}

      {result && (
        <>
          <ExtractSummary result={result} onStartOver={startOver} />
          <ReviewAndSubmit
            kind={kind}
            questionsText={questionsText}
            mcqAnswersText={mcqAnswersText}
            onQuestionsChange={setQuestionsText}
            onMcqAnswersChange={setMcqAnswersText}
            prefillPaperId={prefillPaperId}
          />
        </>
      )}
    </div>
  );
}

function ExtractForm({
  kind,
  onKindChange,
  onExtracted,
}: {
  readonly kind: Kind;
  readonly onKindChange: (kind: Kind) => void;
  readonly onExtracted: (result: ExtractResult) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setProblem("Choose a PDF first");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const result = await extractPdf({ file, pages: pages.trim(), kind, hint: hint.trim() || undefined });
      onExtracted(result);
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionHeading>1. Read the pages</SectionHeading>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={kind === "paper"}
              onChange={() => onKindChange("paper")}
              className="accent-brand-600"
            />
            Past paper
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={kind === "scheme"}
              onChange={() => onKindChange("scheme")}
              className="accent-brand-600"
            />
            Marking scheme
          </label>
        </div>

        <div className="space-y-1">
          <label htmlFor="import-file" className="block text-sm text-slate-600">
            Scanned PDF
          </label>
          <input
            id="import-file"
            type="file"
            accept="application/pdf"
            required
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
        </div>

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

        {problem && <ErrorBox message={problem} />}
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
        <div>
          <SectionHeading>2. What the model read</SectionHeading>
          <p className="text-sm text-slate-500">
            Read by <span className="font-mono">{result.model}</span>. Pages {result.pages_read.join(", ")}{" "}
            of {result.page_count} read.
          </p>
        </div>
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
  kind,
  questionsText,
  mcqAnswersText,
  onQuestionsChange,
  onMcqAnswersChange,
  prefillPaperId,
}: {
  readonly kind: Kind;
  readonly questionsText: string;
  readonly mcqAnswersText: string;
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

      {kind === "scheme" && (
        <div className="mt-3 space-y-1">
          <label htmlFor="import-mcq-answers" className="block text-sm text-slate-600">
            MCQ answer key <span className="text-xs text-slate-400">if this page had one</span>
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

      {kind === "paper" ? (
        <CreatePaperForm questionsText={questionsText} prefillPaperId={prefillPaperId} />
      ) : (
        <CreateSchemeForm
          questionsText={questionsText}
          mcqAnswersText={mcqAnswersText}
          prefillPaperId={prefillPaperId}
        />
      )}
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

function CreatePaperForm({
  questionsText,
  prefillPaperId,
}: {
  readonly questionsText: string;
  readonly prefillPaperId?: string;
}) {
  const [mode, setMode] = useState<"new" | "existing">(prefillPaperId ? "existing" : "new");
  const [title, setTitle] = useState("");
  const [paperKind, setPaperKind] = useState<"past" | "model">("past");
  const [year, setYear] = useState("");
  const [existingPaperId, setExistingPaperId] = useState(prefillPaperId ?? "");
  const [sectionCode, setSectionCode] = useState("");
  const [sectionTitle, setSectionTitle] = useState("");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("mcq");
  const [marksEach, setMarksEach] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: number; title: string; appended: boolean } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setCreated(null);
    try {
      const questions = parseJsonArray(questionsText, "Questions");
      if (mode === "existing") {
        const paperId = Number(existingPaperId);
        const paper = await appendPaperQuestionsFromExtraction(paperId, sectionCode.trim(), {
          questions,
          marksEach: marksEach.trim() ? Number(marksEach) : undefined,
        });
        setCreated({ id: paper.id, title: paper.title, appended: true });
      } else {
        const paper = await createPaperFromExtraction({
          questions,
          title: title.trim(),
          kind: paperKind,
          year: year.trim() ? Number(year) : undefined,
          sectionCode: sectionCode.trim(),
          sectionTitle: sectionTitle.trim(),
          answerMode,
          marksEach: marksEach.trim() ? Number(marksEach) : undefined,
        });
        setCreated({ id: paper.id, title: paper.title, appended: false });
      }
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : (cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <p className="mt-4 rounded-xl bg-brand-50 p-3 text-sm text-brand-800">
        {created.appended
          ? `Added to "${created.title}".`
          : `Created "${created.title}" as a draft.`}{" "}
        <Link to={`/admin/papers/${created.id}`} className="font-medium underline">
          Open it
        </Link>{" "}
        to add a marking scheme and publish it.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
      <p className="text-sm font-medium text-slate-700">Paper and section details</p>

      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={mode === "new"}
            onChange={() => setMode("new")}
            className="accent-brand-600"
          />
          Create a new paper
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={mode === "existing"}
            onChange={() => setMode("existing")}
            className="accent-brand-600"
          />
          Add to an existing paper
        </label>
      </div>

      {mode === "existing" && (
        <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">
          For resuming an import split across several sessions (e.g. after a daily AI quota
          resets) - the questions above are added after whatever is already in that section.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {mode === "existing" ? (
          <LabelledInput
            id="existing-paper-id"
            label="Paper id"
            hint="from its Papers & schemes page URL"
            value={existingPaperId}
            onChange={setExistingPaperId}
            type="number"
            required
          />
        ) : (
          <>
            <LabelledInput id="paper-title" label="Paper title" value={title} onChange={setTitle} required />
            <div className="space-y-1">
              <label htmlFor="paper-kind" className="block text-sm text-slate-600">
                Kind
              </label>
              <select
                id="paper-kind"
                value={paperKind}
                onChange={(event) => setPaperKind(event.target.value as "past" | "model")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="past">Past paper</option>
                <option value="model">Model paper</option>
              </select>
            </div>
            {paperKind === "past" && (
              <LabelledInput id="paper-year" label="Year" value={year} onChange={setYear} type="number" required />
            )}
          </>
        )}
        <LabelledInput id="section-code" label="Section code" hint='e.g. "I" or "II-A"' value={sectionCode} onChange={setSectionCode} required />
        {mode === "new" && (
          <>
            <LabelledInput id="section-title" label="Section title" value={sectionTitle} onChange={setSectionTitle} required />
            <div className="space-y-1">
              <label htmlFor="answer-mode" className="block text-sm text-slate-600">
                Answer mode
              </label>
              <select
                id="answer-mode"
                value={answerMode}
                onChange={(event) => setAnswerMode(event.target.value as AnswerMode)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="mcq">MCQ</option>
                <option value="structured">Structured</option>
                <option value="essay">Essay</option>
              </select>
            </div>
          </>
        )}
        <LabelledInput
          id="marks-each"
          label="Marks each"
          hint="if every question is worth the same"
          value={marksEach}
          onChange={setMarksEach}
          type="number"
        />
      </div>

      <Button type="submit" disabled={busy}>
        {busy ? "Saving..." : mode === "existing" ? "Add these questions" : "Create this paper"}
      </Button>

      {problem && <ErrorBox message={problem} />}
    </form>
  );
}

function CreateSchemeForm({
  questionsText,
  mcqAnswersText,
  prefillPaperId,
}: {
  readonly questionsText: string;
  readonly mcqAnswersText: string;
  readonly prefillPaperId?: string;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [paperId, setPaperId] = useState(prefillPaperId ?? "");
  const [version, setVersion] = useState("");
  const [sectionCode, setSectionCode] = useState("");
  const [mcqMarks, setMcqMarks] = useState("");
  const [source, setSource] = useState<SchemeSource>("official");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [created, setCreated] = useState<{ paperId: number; version: number; appended: boolean } | null>(
    null,
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setCreated(null);
    try {
      const questions = parseJsonArray(questionsText, "Questions");
      const mcqAnswers = parseJsonArray(mcqAnswersText, "MCQ answer key");
      if (mode === "existing") {
        const scheme = await appendSchemeQuestionsFromExtraction(Number(paperId), Number(version), {
          questions,
          mcqAnswers,
          sectionCode: sectionCode.trim(),
          mcqMarks: mcqMarks.trim() ? Number(mcqMarks) : undefined,
        });
        setCreated({ paperId: Number(paperId), version: scheme.version, appended: true });
      } else {
        const scheme = await createSchemeFromExtraction(Number(paperId), {
          questions,
          mcqAnswers,
          sectionCode: sectionCode.trim(),
          mcqMarks: mcqMarks.trim() ? Number(mcqMarks) : undefined,
          source,
          notes: notes.trim() || undefined,
        });
        setCreated({ paperId: Number(paperId), version: scheme.version, appended: false });
      }
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : (cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <p className="mt-4 rounded-xl bg-brand-50 p-3 text-sm text-brand-800">
        {created.appended
          ? `Added to version ${created.version} (still a draft).`
          : `Created version ${created.version} as a draft.`}{" "}
        <Link to={`/admin/papers/${created.paperId}`} className="font-medium underline">
          Open the paper
        </Link>{" "}
        to validate, approve and publish it.
      </p>
    );
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
        <LabelledInput id="scheme-section-code" label="Section code" hint='e.g. "I" or "II-A"' value={sectionCode} onChange={setSectionCode} required />
        <LabelledInput id="scheme-mcq-marks" label="Marks per MCQ" hint="if there is an answer key above" value={mcqMarks} onChange={setMcqMarks} type="number" />
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
      {mode === "new" && (
        <LabelledInput id="scheme-notes" label="Notes (optional)" value={notes} onChange={setNotes} />
      )}

      <Button type="submit" disabled={busy}>
        {busy ? "Saving..." : mode === "existing" ? "Add these entries" : "Create this scheme version"}
      </Button>

      {problem && <ErrorBox message={problem} />}
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
