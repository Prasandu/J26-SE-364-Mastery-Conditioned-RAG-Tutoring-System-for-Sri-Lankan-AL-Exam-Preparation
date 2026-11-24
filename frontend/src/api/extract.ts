// Reading a scanned marking scheme PDF into a draft to review, then turning the
// reviewed draft into a real scheme version. Admin only. Past papers themselves
// are no longer read this way - see api/admin.ts's createPastPaper.

import { request } from "./client";
import type { ExtractResult, SchemeSource, SchemeSummary } from "./types";

export interface ExtractInput {
  file: File;
  pages: string; // e.g. "2-5" or "1,3,5"
  kind: "scheme";
  hint?: string;
}

export function extractPdf(input: ExtractInput): Promise<ExtractResult> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("pages", input.pages);
  form.append("kind", input.kind);
  if (input.hint) {
    form.append("hint", input.hint);
  }
  return request<ExtractResult>("/admin/extract", { method: "POST", form });
}

export interface AppendSchemeQuestionsFromExtractionInput {
  questions: Record<string, unknown>[];
  mcqAnswers: Record<string, unknown>[];
  sectionCode: string;
  mcqMarks?: number;
}

/** Add more scheme entries (from a later OCR session) to an existing editable
 * scheme version - the scheme-side half of appendPaperQuestionsFromExtraction. */
export function appendSchemeQuestionsFromExtraction(
  paperId: number,
  version: number,
  input: AppendSchemeQuestionsFromExtractionInput,
): Promise<SchemeSummary> {
  return request<SchemeSummary>(`/admin/extract/papers/${paperId}/marking-schemes/${version}/questions`, {
    method: "POST",
    body: {
      questions: input.questions,
      mcq_answers: input.mcqAnswers,
      section_code: input.sectionCode,
      mcq_marks: input.mcqMarks ?? null } });
}

export interface CreateSchemeFromExtractionInput {
  questions: Record<string, unknown>[];
  mcqAnswers: Record<string, unknown>[];
  sectionCode: string;
  mcqMarks?: number;
  source: SchemeSource;
  notes?: string;
}

export function createSchemeFromExtraction(
  paperId: number,
  input: CreateSchemeFromExtractionInput,
): Promise<SchemeSummary> {
  return request<SchemeSummary>(`/admin/extract/papers/${paperId}/marking-schemes`, {
    method: "POST",
    body: {
      questions: input.questions,
      mcq_answers: input.mcqAnswers,
      section_code: input.sectionCode,
      mcq_marks: input.mcqMarks ?? null,
      source: input.source,
      notes: input.notes || null } });
}
