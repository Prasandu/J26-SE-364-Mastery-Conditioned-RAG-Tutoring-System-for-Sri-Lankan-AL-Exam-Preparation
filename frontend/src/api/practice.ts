// Practice papers a student makes for themselves. No key needed: these are public.

import { request } from "./client";
import type { Counts, GeneratedPaper, PaperSummary, PracticeLimits, Rates, Shape } from "./types";

interface PracticeBody {
  title: string;
  student_ref: string;
  topic_codes: string[];
  counts: Counts;
}

export function practiceRates(signal?: AbortSignal): Promise<Rates> {
  return request<Rates>("/papers/practice/rates", { signal });
}

export function practiceLimits(studentRef: string, signal?: AbortSignal): Promise<PracticeLimits> {
  return request<PracticeLimits>(
    `/papers/practice/limits?student_ref=${encodeURIComponent(studentRef)}`,
    { signal },
  );
}

export function planPractice(body: PracticeBody, signal?: AbortSignal): Promise<Shape> {
  return request<Shape>("/papers/practice/plan", { method: "POST", body, signal });
}

export function makePractice(body: PracticeBody): Promise<GeneratedPaper> {
  return request<GeneratedPaper>("/papers/practice", { method: "POST", body });
}

/** Papers to show a student: the shared ones, plus their own practice papers. */
export function myPapers(studentRef: string, signal?: AbortSignal): Promise<PaperSummary[]> {
  const query = studentRef ? `?student_ref=${encodeURIComponent(studentRef)}` : "";
  return request<PaperSummary[]>(`/papers${query}`, { signal });
}
