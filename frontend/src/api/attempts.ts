import { request } from "./client";

export function startAttempt<T>(paperId: string) {
  return request<T>("/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paper_id: paperId }),
  });
}

export function saveAnswer<T>(attemptId: string, answer: unknown) {
  return request<T>(`/attempts/${encodeURIComponent(attemptId)}/answers`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(answer),
  });
}

export function submitAttempt<T>(attemptId: string) {
  return request<T>(`/attempts/${encodeURIComponent(attemptId)}/submit`, {
    method: "POST",
  });
}
