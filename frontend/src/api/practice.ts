// Practice papers a student makes for themselves. Needs a signed-in student account
// (see POST /papers/practice) - the request's Authorization token decides who, so
// nothing here passes a student id of its own any more.

import { request } from "./client";
import type {
  Counts,
  GeneratedPaper,
  PaperSummary,
  PracticeLimits,
  Rates,
  Shape,
  TopicMastery,
} from "./types";

interface PracticeBody {
  title: string;
  topic_codes: string[];
  counts: Counts;
}

export function practiceRates(signal?: AbortSignal): Promise<Rates> {
  return request<Rates>("/papers/practice/rates", { signal });
}

export function practiceLimits(signal?: AbortSignal): Promise<PracticeLimits> {
  return request<PracticeLimits>("/papers/practice/limits", { signal });
}

/** The signed-in student's own accuracy per topic, weakest first. */
export function practiceMastery(signal?: AbortSignal): Promise<TopicMastery[]> {
  return request<TopicMastery[]>("/papers/practice/mastery", { signal });
}

export function planPractice(body: PracticeBody, signal?: AbortSignal): Promise<Shape> {
  return request<Shape>("/papers/practice/plan", { method: "POST", body, signal });
}

export function makePractice(body: PracticeBody): Promise<GeneratedPaper> {
  return request<GeneratedPaper>("/papers/practice", { method: "POST", body });
}

/** Papers to show: the shared ones, plus the signed-in student's own practice papers. */
export function myPapers(signal?: AbortSignal): Promise<PaperSummary[]> {
  return request<PaperSummary[]>("/papers", { signal });
}
