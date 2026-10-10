import { request } from "./client";
import type { Health, PaperDetail, PaperSummary } from "./types";

export function listPapers(signal?: AbortSignal): Promise<PaperSummary[]> {
  return request<PaperSummary[]>("/papers", { signal });
}

export function getPaper(paperId: number, signal?: AbortSignal): Promise<PaperDetail> {
  return request<PaperDetail>(`/papers/${paperId}`, { signal });
}

export function getHealth(signal?: AbortSignal): Promise<Health> {
  return request<Health>("/health", { signal });
}
