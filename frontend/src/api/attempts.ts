import { request } from "./client";
import type { AnswerInput, AnswerOut, Attempt, SheetRead } from "./types";

export function startAttempt(paperId: number, signal?: AbortSignal): Promise<Attempt> {
  return request<Attempt>("/attempts", {
    method: "POST",
    body: { paper_id: paperId },
    signal,
  });
}

/** The signed-in student's own attempts, newest first, with the marks they were given. */
export function myAttempts(signal?: AbortSignal): Promise<Attempt[]> {
  return request<Attempt[]>("/attempts", { signal });
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

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function uploadAnswerImage(
  attemptId: string,
  questionId: number,
  file: File,
): Promise<AnswerOut> {
  const form = new FormData();
  form.append("file", file);
  return request<AnswerOut>(`/attempts/${attemptId}/answers/${questionId}/images`, {
    method: "POST",
    form,
  });
}

export function readAnswerSheet(attemptId: string, file: File): Promise<SheetRead> {
  const form = new FormData();
  form.append("file", file);
  return request<SheetRead>(`/attempts/${attemptId}/answer-sheet`, { method: "POST", form });
}

/** Save several MCQ answers at once, after the student has checked them. */
export function saveAnswers(
  attemptId: string,
  answers: { question_id: number; mcq_option: string }[],
): Promise<Attempt> {
  return request<Attempt>(`/attempts/${attemptId}/answers`, {
    method: "PUT",
    body: { answers },
  });
}
