import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { createPastPaper } from "@/api/admin";
import { ApiError } from "@/api/client";
import type { AnswerMode } from "@/api/types";
import { Button } from "@/components/Button";
import { Card, SectionHeading } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { FileField } from "@/components/FileField";

/**
 * Create a past paper from its own PDF, shown to students as-is, instead of
 * OCR-transcribing the question text. Just the paper's own details and its file -
 * no question text or skeleton here either; add its questions afterward, one at a
 * time, from the paper's own page, once the real paper's layout is known (see
 * app/api/admin.py's POST /admin/papers/past).
 */
export function PastPaperImportPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("mcq");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setProblem("Choose the paper's PDF first");
      return;
    }

    setBusy(true);
    setProblem(null);
    try {
      const paper = await createPastPaper({ title: title.trim(), year: Number(year), answerMode, file });
      navigate(`/admin/papers/${paper.id}`);
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : String(cause));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Past paper (PDF)</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload the real exam PDF - students see it directly, not a transcription. Add its questions
          and a marking scheme afterward, from the paper&apos;s own page.
        </p>
      </div>

      <Card>
        <form onSubmit={submit} className="space-y-4">
          <SectionHeading>Paper details</SectionHeading>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabelledInput id="pp-title" label="Title" value={title} onChange={setTitle} required />
            <LabelledInput id="pp-year" label="Year" value={year} onChange={setYear} type="number" required />
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
  value,
  onChange,
  type = "text",
  required = false,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: string;
  readonly required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm text-slate-600">
        {label}
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
