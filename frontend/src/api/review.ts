import { request, requestBlob } from "./client";
import type {
  Agreement,
  PointReview,
  PointStatus,
  ReviewDecision,
  ReviewItem,
  ReviewScript,
  ReviewedPoint } from "./types";

interface QueueFilter {
  paperId?: number;
  status?: PointStatus;
  limit?: number;
}

export function reviewQueue(filter: QueueFilter = {}, signal?: AbortSignal): Promise<ReviewItem[]> {
  const query = new URLSearchParams();
  if (filter.paperId !== undefined) {
    query.set("paper_id", String(filter.paperId));
  }
  if (filter.status) {
    query.set("status", filter.status);
  }
  query.set("limit", String(filter.limit ?? 50));

  return request<ReviewItem[]>(`/review/queue?${query}`, { signal });
}

/** One photo of a handwritten answer, for marking a drawing the reader could not read. */
export function answerImage(imageId: number, signal?: AbortSignal): Promise<Blob> {
  return requestBlob(`/review/images/${imageId}`, { signal });
}

export function agreement(paperId?: number, signal?: AbortSignal): Promise<Agreement> {
  const query = paperId === undefined ? "" : `?paper_id=${paperId}`;
  return request<Agreement>(`/review/agreement${query}`, { signal });
}

export function decidePoint(resultId: number, decision: ReviewDecision): Promise<ReviewedPoint> {
  return request<ReviewedPoint>(`/review/points/${resultId}`, {
    method: "POST",
    body: decision });
}

export function reviewScripts(paperId?: number, signal?: AbortSignal): Promise<ReviewScript[]> {
  const query = paperId === undefined ? "" : `?paper_id=${paperId}`;
  return request<ReviewScript[]>(`/review/scripts${query}`, { signal });
}

/** Every marking point of one script, decided or not. */
export function scriptPoints(attemptId: string, signal?: AbortSignal): Promise<ReviewItem[]> {
  return request<ReviewItem[]>(`/review/attempts/${attemptId}`, { signal });
}

/** Every decision made on one marking point, oldest first. */
export function pointHistory(resultId: number, signal?: AbortSignal): Promise<PointReview[]> {
  return request<PointReview[]>(`/review/points/${resultId}/history`, {
    signal });
}
