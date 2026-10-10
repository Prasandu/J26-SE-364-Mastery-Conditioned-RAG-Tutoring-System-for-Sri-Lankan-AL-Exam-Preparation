import { request } from "./client";
import type { AnswerInput, AnswerOut, Attempt } from "./types";

export function startAttempt(
  paperId: number,
  studentRef: string,
  signal?: AbortSignal,
): Promise<Attempt> {
  return request<Attempt>("/attempts", {
    method: "POST",
    body: { paper_id: paperId, student_ref: studentRef },
    signal,
  });
}

export function getAttempt(attemptId: string, signal?: AbortSignal): Promise<Attempt> {
  return request<Attempt>(`/attempts/${attemptId}`, { signal });
}

export function saveAnswer(
  attemptId: string,
  questionId: number,
  answer: AnswerInput,
): Promise<AnswerOut> {
  return request<AnswerOut>(`/attempts/${attemptId}/answers/${questionId}`, {
    method: "PUT",
    body: answer,
  });
}

export function submitAttempt(attemptId: string): Promise<Attempt> {
  return request<Attempt>(`/attempts/${attemptId}/submit`, { method: "POST" });
}
