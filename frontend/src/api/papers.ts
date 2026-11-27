import { request, requestBlob } from "./client";
import type { Health, PaperDetail, PaperSummary } from "./types";

export function listPapers(signal?: AbortSignal): Promise<PaperSummary[]> {
  return request<PaperSummary[]>("/papers", { signal });
}

export function getPaper(paperId: number, signal?: AbortSignal): Promise<PaperDetail> {
  return request<PaperDetail>(`/papers/${paperId}`, { signal });
}

/** A past paper's own PDF (see PaperDetail.has_pdf) - fetched rather than linked
 * directly, same reason as a review photo: a signed-in request may carry a token
 * an <iframe src> cannot send. */
export function getPaperFile(paperId: number, signal?: AbortSignal): Promise<Blob> {
  return requestBlob(`/papers/${paperId}/file`, { signal });
}

export function getHealth(signal?: AbortSignal): Promise<Health> {
  return request<Health>("/health", { signal });
}
