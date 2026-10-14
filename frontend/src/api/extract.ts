// Reading a scanned past paper or marking scheme PDF into a draft to review, then
// turning the reviewed draft into a real paper or scheme. Admin only.

import { request } from "./client";
import type { AdminPaperDetail, ExtractResult, SchemeSource, SchemeSummary } from "./types";

export interface ExtractInput {
  file: File;
  pages: string; // e.g. "2-5" or "1,3,5"
  kind: "paper" | "scheme";
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

export interface CreatePaperFromExtractionInput {
  questions: Record<string, unknown>[];
  title: string;
  kind: "past" | "model";
  year?: number;
  subject?: string;
  sectionCode: string;
  sectionTitle: string;
  answerMode: "mcq" | "structured" | "essay";
  chooseCount?: number;
  instructions?: string;
  marksEach?: number;
}

export function createPaperFromExtraction(input: CreatePaperFromExtractionInput): Promise<AdminPaperDetail> {
  return request<AdminPaperDetail>("/admin/extract/papers", {
    method: "POST",
    body: {
      questions: input.questions,
      title: input.title,
      kind: input.kind,
      year: input.year ?? null,
      subject: input.subject || "chemistry",
      section_code: input.sectionCode,
      section_title: input.sectionTitle,
      answer_mode: input.answerMode,
      choose_count: input.chooseCount ?? null,
      instructions: input.instructions || null,
      marks_each: input.marksEach ?? null } });
}

export interface AppendPaperQuestionsFromExtractionInput {
  questions: Record<string, unknown>[];
  marksEach?: number;
}

/** Add more questions (from a later OCR session) to an existing draft section -
 * for resuming an import after a daily AI quota resets, without losing what was
 * already saved. The section's own answer_mode etc. come from the paper itself. */
export function appendPaperQuestionsFromExtraction(
  paperId: number,
  sectionCode: string,
  input: AppendPaperQuestionsFromExtractionInput,
): Promise<AdminPaperDetail> {
  return request<AdminPaperDetail>(`/admin/extract/papers/${paperId}/sections/${sectionCode}/questions`, {
    method: "POST",
    body: {
      questions: input.questions,
      marks_each: input.marksEach ?? null } });
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
