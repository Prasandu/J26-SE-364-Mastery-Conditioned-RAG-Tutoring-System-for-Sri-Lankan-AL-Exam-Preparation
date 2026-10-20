import { useState } from "react";
import { Link } from "react-router-dom";

import { createPastPaper } from "@/api/admin";
import { ApiError } from "@/api/client";
import type { AnswerMode } from "@/api/types";
import { Button } from "@/components/Button";
import { Card, SectionHeading } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { FileField } from "@/components/FileField";

interface SkeletonRow {
  label: string;
  maxMarks: string;
  startPage: string;
}

function emptyRow(): SkeletonRow {
  return { label: "", maxMarks: "", startPage: "" };
}

/**
 * Create a past paper from its own PDF, shown to students as-is, instead of
 * OCR-transcribing the question text. The admin only types a skeleton - a label,
 * marks and starting page per question - not the wording itself (see
 * app/api/admin.py's POST /admin/papers/past).
 *
 * One section per import, same as "Import a PDF" - a paper with more than one
 * section (e.g. Paper I and Paper II) needs one import per section; add the rest
 * from the paper's own page afterwards.
 */
export function PastPaperImportPage() {
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [sectionCode, setSectionCode] = useState("");
  const [sectionTitle, setSectionTitle] = useState("");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("mcq");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<SkeletonRow[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: number; title: string } | null>(null);

  function updateRow(index: number, patch: Partial<SkeletonRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, emptyRow()]);
  }

  function removeRow(index: number) {
    setRows((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : current));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setProblem("Choose the paper's PDF first");
      return;
    }
    const questions = rows
      .filter((row) => row.label.trim())
      .map((row) => ({
        label: row.label.trim(),
        max_marks: row.maxMarks.trim() ? Number(row.maxMarks) : null,
        start_page: row.startPage.trim() ? Number(row.startPage) : null,
      }));
    if (questions.length === 0) {
      setProblem("Add at least one question");
      return;
    }

    setBusy(true);
    setProblem(null);
    setCreated(null);
    try {
      const paper = await createPastPaper({
        title: title.trim(),
        year: Number(year),
        sectionCode: sectionCode.trim(),
        sectionTitle: sectionTitle.trim(),
        answerMode,
        questions,
        file,
      });
      setCreated({ id: paper.id, title: paper.title });
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Card>
        <p className="text-sm text-brand-800">
          Created &quot;{created.title}&quot; as a draft.{" "}
          <Link to={`/admin/papers/${created.id}`} className="font-medium underline">
            Open it
          </Link>{" "}
          to add a marking scheme and publish it.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Past paper (PDF)</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload the real exam PDF and type a skeleton for its questions - a label, marks and the page
          it starts on. Students see the PDF itself, not a transcription. Marking schemes are unaffected
          - still entered via Import a PDF.
        </p>
      </div>

      <Card>
        <form onSubmit={submit} className="space-y-4">
          <SectionHeading>Paper details</SectionHeading>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabelledInput id="pp-title" label="Title" value={title} onChange={setTitle} required />
            <LabelledInput id="pp-year" label="Year" value={year} onChange={setYear} type="number" required />
            <LabelledInput
              id="pp-section-code"
              label="Section code"
              hint='e.g. "I" or "II-A"'
              value={sectionCode}
              onChange={setSectionCode}
              required
            />
            <LabelledInput
              id="pp-section-title"
              label="Section title"
              value={sectionTitle}
              onChange={setSectionTitle}
              required
            />
            <div className="space-y-1">
              <label htmlFor="pp-answer-mode" className="block text-sm text-slate-600">
                Answer mode
              </label>
              <select
                id="pp-answer-mode"
                value={answerMode}
                onChange={(event) => setAnswerMode(event.target.value as AnswerMode)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="mcq">MCQ</option>
                <option value="structured">Structured</option>
                <option value="essay">Essay</option>
              </select>
            </div>
          </div>

          <FileField id="pp-file" label="Paper PDF" accept="application/pdf" file={file} onChange={setFile} />

          <div className="space-y-2 border-t border-slate-100 pt-4">
            <SectionHeading>Questions</SectionHeading>
            <p className="text-sm text-slate-500">
              One row per question - the wording itself comes from the PDF on the student's screen.
            </p>
            <div className="space-y-2">
              {rows.map((row, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                  <LabelledInput
                    id={`pp-q-label-${index}`}
                    label="Label"
                    hint='e.g. "1" or "(a)"'
                    value={row.label}
                    onChange={(value) => updateRow(index, { label: value })}
                  />
                  <LabelledInput
                    id={`pp-q-marks-${index}`}
                    label="Max marks"
                    value={row.maxMarks}
                    onChange={(value) => updateRow(index, { maxMarks: value })}
                    type="number"
                  />
                  <LabelledInput
                    id={`pp-q-page-${index}`}
                    label="Starts on page"
                    value={row.startPage}
                    onChange={(value) => updateRow(index, { startPage: value })}
                    type="number"
                  />
                  <Button type="button" variant="secondary" onClick={() => removeRow(index)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="secondary" onClick={addRow}>
              Add a question
            </Button>
          </div>

          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Create this paper"}
          </Button>

          {problem && <ErrorBox message={problem} />}
        </form>
      </Card>
    </div>
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
