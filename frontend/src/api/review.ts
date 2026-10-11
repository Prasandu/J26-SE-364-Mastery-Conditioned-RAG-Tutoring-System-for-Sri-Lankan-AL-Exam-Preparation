import { request } from "./client";

export function getReviewQueue<T>() {
  return request<T[]>("/reviews");
}

export function submitReviewDecision<T>(reviewId: string, decision: unknown) {
  return request<T>(`/reviews/${encodeURIComponent(reviewId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(decision),
  });
}
