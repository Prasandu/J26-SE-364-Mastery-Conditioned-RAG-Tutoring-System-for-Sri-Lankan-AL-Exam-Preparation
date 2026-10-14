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

export function publishPaper(paperId: number): Promise<unknown> {
  return request(`/admin/papers/${paperId}/publish`, { method: "POST" });
}

/** New draft paper with the same sections and questions - the way to correct a
 * published paper (its marking schemes are not copied). */
export function copyPaper(paperId: number): Promise<AdminPaperDetail> {
  return request<AdminPaperDetail>(`/admin/papers/${paperId}/copy`, { method: "POST" });
}
