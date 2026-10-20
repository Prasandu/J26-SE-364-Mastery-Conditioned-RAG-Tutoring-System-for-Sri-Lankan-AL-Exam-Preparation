import { request } from "./client";
import type {
  AdminPaperDetail,
  AdminUser,
  Counts,
  GeneratedPaper,
  PapersPageOut,
  Rates,
  SchemeSummary,
  SchemeValidationOut,
  Shape,
  SuggestionStatus,
  Topic,
  TopicSuggestion } from "./types";

export function listTopics(signal?: AbortSignal): Promise<Topic[]> {
  return request<Topic[]>("/admin/topics", { signal });
}

export function listUsers(signal?: AbortSignal): Promise<AdminUser[]> {
  return request<AdminUser[]>("/admin/users", { signal });
}

export function createUser(body: {
  email: string;
  name: string;
  password: string;
  role: AdminUser["role"];
}): Promise<AdminUser> {
  return request<AdminUser>("/admin/users", { method: "POST", body });
}

export function updateUserRole(userId: number, role: AdminUser["role"]): Promise<AdminUser> {
  return request<AdminUser>(`/admin/users/${userId}/role?role=${role}`, {
    method: "PATCH" });
}

export function updateUserStatus(userId: number, isActive: boolean): Promise<AdminUser> {
  return request<AdminUser>(`/admin/users/${userId}/status?is_active=${isActive}`, {
    method: "PATCH" });
}

export function generatorRates(signal?: AbortSignal): Promise<Rates> {
  return request<Rates>("/admin/model-papers/rates", { signal });
}

interface GenerateBody {
  title: string;
  topic_codes: string[];
  counts: Counts;
}

export function planPaper(body: GenerateBody, signal?: AbortSignal): Promise<Shape> {
  return request<Shape>("/admin/model-papers/plan", {
    method: "POST",
    body,
    signal });
}

export function generatePaper(body: GenerateBody): Promise<GeneratedPaper> {
  return request<GeneratedPaper>("/admin/model-papers", {
    method: "POST",
    body });
}

export function adminPaper(paperId: number, signal?: AbortSignal): Promise<AdminPaperDetail> {
  return request<AdminPaperDetail>(`/admin/papers/${paperId}`, { signal });
}

interface PaperSearch {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

/** Every paper, searchable by title and paginated. */
export function listPapers(filter: PaperSearch = {}, signal?: AbortSignal): Promise<PapersPageOut> {
  const query = new URLSearchParams();
  if (filter.search) {
    query.set("search", filter.search);
  }
  if (filter.status) {
    query.set("status", filter.status);
  }
  query.set("page", String(filter.page ?? 1));
  query.set("page_size", String(filter.pageSize ?? 20));
  return request<PapersPageOut>(`/admin/papers?${query}`, { signal });
}

export function retireScheme(paperId: number, version: number): Promise<unknown> {
  return request(`/admin/papers/${paperId}/marking-schemes/${version}/retire`, {
    method: "POST" });
}

export function copyScheme(paperId: number, version: number): Promise<unknown> {
  return request(`/admin/papers/${paperId}/marking-schemes/${version}/copy`, {
    method: "POST" });
}

/** Retag one question. Works whatever its paper's status is. */
export function setQuestionTopics(questionId: number, topicCodes: string[]): Promise<unknown> {
  return request(`/admin/questions/${questionId}/topics`, {
    method: "PATCH",
    body: { topics: topicCodes } });
}

/** Ask the model to suggest topics for questions that have none, or the given ones. */
export function classifyTopics(questionIds?: number[]): Promise<TopicSuggestion[]> {
  return request<TopicSuggestion[]>("/admin/topics/classify", {
    method: "POST",
    body: { question_ids: questionIds ?? null } });
}

export function listTopicSuggestions(
  status?: SuggestionStatus,
  signal?: AbortSignal,
  questionId?: number,
): Promise<TopicSuggestion[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (questionId !== undefined) params.set("question_id", String(questionId));
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<TopicSuggestion[]>(`/admin/topics/suggestions${query}`, {
    signal });
}

/** Apply the suggestion, or only the codes a reviewer kept. */
export function approveSuggestion(
  suggestionId: number,
  decidedBy: string,
  codes?: string[],
): Promise<TopicSuggestion> {
  return request<TopicSuggestion>(`/admin/topics/suggestions/${suggestionId}/approve`, {
    method: "POST",
    body: { decided_by: decidedBy, codes: codes ?? null } });
}

export function rejectSuggestion(
  suggestionId: number,
  decidedBy: string,
): Promise<TopicSuggestion> {
  return request<TopicSuggestion>(`/admin/topics/suggestions/${suggestionId}/reject`, {
    method: "POST",
    body: { decided_by: decidedBy } });
}

export function schemeSummaries(paperId: number, signal?: AbortSignal): Promise<SchemeSummary[]> {
  return request<SchemeSummary[]>(`/admin/papers/${paperId}/marking-schemes`, {
    signal });
}

/** Run the independent validators over a stored scheme and record what they found. */
export function validateScheme(paperId: number, version: number): Promise<SchemeValidationOut> {
  return request<SchemeValidationOut>(
    `/admin/papers/${paperId}/marking-schemes/${version}/validate`,
    {
      method: "POST" },
  );
}

/** A named person takes responsibility for a validated scheme. */
export function approveScheme(
  paperId: number,
  version: number,
  approver: string,
): Promise<unknown> {
  const query = new URLSearchParams({ approver });
  return request(`/admin/papers/${paperId}/marking-schemes/${version}/approve?${query}`, {
    method: "POST" });
}

export function publishScheme(paperId: number, version: number): Promise<unknown> {
  return request(`/admin/papers/${paperId}/marking-schemes/${version}/publish`, {
    method: "POST" });
}

/** Only a draft, validated or validation-failed scheme can be deleted - an
 * approved, published or retired one is permanent (see app/services/schemes.py's
 * ensure_editable). */
export function deleteScheme(paperId: number, version: number): Promise<void> {
  return request<void>(`/admin/papers/${paperId}/marking-schemes/${version}`, { method: "DELETE" });
}

export function publishPaper(paperId: number): Promise<unknown> {
  return request(`/admin/papers/${paperId}/publish`, { method: "POST" });
}

/** New draft paper with the same sections and questions - the way to correct a
 * published paper (its marking schemes are not copied). */
export function copyPaper(paperId: number): Promise<AdminPaperDetail> {
  return request<AdminPaperDetail>(`/admin/papers/${paperId}/copy`, { method: "POST" });
}

/** Only a draft paper can be deleted - a published one is permanent (see
 * app/services/papers.py's ensure_draft). */
export function deletePaper(paperId: number): Promise<void> {
  return request<void>(`/admin/papers/${paperId}`, { method: "DELETE" });
}

export interface CreatePastPaperInput {
  title: string;
  year: number;
  answerMode: "mcq" | "structured" | "essay";
  file: File;
}

/** A past paper shown to students as its own PDF, not OCR'd text - and no question
 * text or skeleton either: just the paper's own details and its PDF. It starts
 * with one section ("I") and no questions - add those afterward with
 * appendQuestions, once the real paper's layout is known. See app/api/admin.py's
 * POST /admin/papers/past. */
export function createPastPaper(input: CreatePastPaperInput): Promise<AdminPaperDetail> {
  const form = new FormData();
  form.append("title", input.title);
  form.append("year", String(input.year));
  form.append("answer_mode", input.answerMode);
  form.append("file", input.file);
  return request<AdminPaperDetail>("/admin/papers/past", { method: "POST", form });
}

export interface QuestionSkeleton {
  label: string;
  max_marks?: number | null;
  start_page?: number | null;
}

/** Add one or more question skeletons (label, marks, starting page - no wording)
 * to an existing draft section - for a past paper whose questions are typed in
 * rather than OCR'd, same as "resume an OCR import" does for the other kind. */
export function appendQuestions(
  paperId: number,
  sectionCode: string,
  questions: QuestionSkeleton[],
): Promise<AdminPaperDetail> {
  return request<AdminPaperDetail>(`/admin/papers/${paperId}/sections/${sectionCode}/questions`, {
    method: "POST",
    body: { questions },
  });
}
