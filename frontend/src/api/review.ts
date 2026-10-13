import { request, requestBlob } from "./client";
import type {
  Agreement,
  PointReview,
  PointStatus,
  ReviewDecision,
  ReviewItem,
  ReviewScript,
  ReviewedPoint,
} from "./types";
import { readTeacherKey } from "@/lib/teacher";

// Every review endpoint needs the teacher key.
function headers(): Record<string, string> {
  return { "X-Teacher-Key": readTeacherKey() };
}

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

  return request<ReviewItem[]>(`/review/queue?${query}`, { headers: headers(), signal });
}

/** One photo of a handwritten answer, for marking a drawing the reader could not read. */
export function answerImage(imageId: number, signal?: AbortSignal): Promise<Blob> {
  return requestBlob(`/review/images/${imageId}`, { headers: headers(), signal });
}

export function agreement(paperId?: number, signal?: AbortSignal): Promise<Agreement> {
  const query = paperId === undefined ? "" : `?paper_id=${paperId}`;
  return request<Agreement>(`/review/agreement${query}`, { headers: headers(), signal });
}

export function decidePoint(resultId: number, decision: ReviewDecision): Promise<ReviewedPoint> {
  return request<ReviewedPoint>(`/review/points/${resultId}`, {
    method: "POST",
    body: decision,
    headers: headers(),
  });
}

export function reviewScripts(paperId?: number, signal?: AbortSignal): Promise<ReviewScript[]> {
  const query = paperId === undefined ? "" : `?paper_id=${paperId}`;
  return request<ReviewScript[]>(`/review/scripts${query}`, { headers: headers(), signal });
}

/** Every marking point of one script, decided or not. */
export function scriptPoints(attemptId: string, signal?: AbortSignal): Promise<ReviewItem[]> {
  return request<ReviewItem[]>(`/review/attempts/${attemptId}`, { headers: headers(), signal });
}

/** Every decision made on one marking point, oldest first. */
export function pointHistory(resultId: number, signal?: AbortSignal): Promise<PointReview[]> {
  return request<PointReview[]>(`/review/points/${resultId}/history`, {
    headers: headers(),
    signal,
  });
}
