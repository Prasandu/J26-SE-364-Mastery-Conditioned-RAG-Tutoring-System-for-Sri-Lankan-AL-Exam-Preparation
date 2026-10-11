import { request } from "./client";
import type { Agreement, PointStatus, ReviewDecision, ReviewItem, ReviewedPoint } from "./types";
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
