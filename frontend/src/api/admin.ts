import { readAdminKey } from "@/lib/teacher";

import { request } from "./client";
import type {
  AdminPaperDetail,
  Counts,
  GeneratedPaper,
  PapersPageOut,
  Rates,
  SchemeSummary,
  SchemeValidationOut,
  Shape,
  SuggestionStatus,
  Topic,
  TopicSuggestion,
} from "./types";

// Every admin endpoint needs the admin key.
function headers(): Record<string, string> {
  return { "X-Admin-Key": readAdminKey() };
}

export function listTopics(signal?: AbortSignal): Promise<Topic[]> {
  return request<Topic[]>("/admin/topics", { headers: headers(), signal });
}

export function generatorRates(signal?: AbortSignal): Promise<Rates> {
  return request<Rates>("/admin/model-papers/rates", { headers: headers(), signal });
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
    headers: headers(),
    signal,
  });
}

export function generatePaper(body: GenerateBody): Promise<GeneratedPaper> {
  return request<GeneratedPaper>("/admin/model-papers", {
    method: "POST",
    body,
    headers: headers(),
  });
}

export function adminPaper(paperId: number, signal?: AbortSignal): Promise<AdminPaperDetail> {
  return request<AdminPaperDetail>(`/admin/papers/${paperId}`, { headers: headers(), signal });
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
  return request<PapersPageOut>(`/admin/papers?${query}`, { headers: headers(), signal });
}

export function retireScheme(paperId: number, version: number): Promise<unknown> {
  return request(`/admin/papers/${paperId}/marking-schemes/${version}/retire`, {
    method: "POST",
    headers: headers(),
  });
}

export function copyScheme(paperId: number, version: number): Promise<unknown> {
  return request(`/admin/papers/${paperId}/marking-schemes/${version}/copy`, {
    method: "POST",
    headers: headers(),
  });
}

/** Retag one question. Works whatever its paper's status is. */
export function setQuestionTopics(questionId: number, topicCodes: string[]): Promise<unknown> {
  return request(`/admin/questions/${questionId}/topics`, {
    method: "PATCH",
    body: { topics: topicCodes },
    headers: headers(),
  });
}

/** Ask the model to suggest topics for questions that have none, or the given ones. */
export function classifyTopics(questionIds?: number[]): Promise<TopicSuggestion[]> {
  return request<TopicSuggestion[]>("/admin/topics/classify", {
    method: "POST",
    body: { question_ids: questionIds ?? null },
    headers: headers(),
  });
}

export function listTopicSuggestions(
  status?: SuggestionStatus,
  signal?: AbortSignal,
): Promise<TopicSuggestion[]> {
  const query = status ? `?status=${status}` : "";
  return request<TopicSuggestion[]>(`/admin/topics/suggestions${query}`, {
    headers: headers(),
    signal,
  });
}

/** Apply the suggestion, or only the codes a reviewer kept. */
export function approveSuggestion(
  suggestionId: number,
  decidedBy: string,
  codes?: string[],
): Promise<TopicSuggestion> {
  return request<TopicSuggestion>(`/admin/topics/suggestions/${suggestionId}/approve`, {
    method: "POST",
    body: { decided_by: decidedBy, codes: codes ?? null },
    headers: headers(),
  });
}

export function rejectSuggestion(
  suggestionId: number,
  decidedBy: string,
): Promise<TopicSuggestion> {
  return request<TopicSuggestion>(`/admin/topics/suggestions/${suggestionId}/reject`, {
    method: "POST",
    body: { decided_by: decidedBy },
    headers: headers(),
  });
}

export function schemeSummaries(paperId: number, signal?: AbortSignal): Promise<SchemeSummary[]> {
  return request<SchemeSummary[]>(`/admin/papers/${paperId}/marking-schemes`, {
    headers: headers(),
    signal,
  });
}

/** Run the independent validators over a stored scheme and record what they found. */
export function validateScheme(paperId: number, version: number): Promise<SchemeValidationOut> {
  return request<SchemeValidationOut>(
    `/admin/papers/${paperId}/marking-schemes/${version}/validate`,
    {
      method: "POST",
      headers: headers(),
    },
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
    method: "POST",
    headers: headers(),
  });
}

export function publishScheme(paperId: number, version: number): Promise<unknown> {
  return request(`/admin/papers/${paperId}/marking-schemes/${version}/publish`, {
    method: "POST",
    headers: headers(),
  });
}

export function publishPaper(paperId: number): Promise<unknown> {
  return request(`/admin/papers/${paperId}/publish`, { method: "POST", headers: headers() });
}
