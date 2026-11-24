import { authFetch } from "./apiClient";
import type { HintResponse } from "../types/question";
import type { CheckFlaggedAnswerResponse, Explanation, FlaggedQuestion } from "../types/practice";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function getReviewQueue(studentId: string): Promise<FlaggedQuestion[]> {
  const res = await authFetch(`${API_BASE_URL}/api/v1/students/${studentId}/practice/review-queue`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export async function explainFlaggedQuestion(flaggedQuestionId: number): Promise<Explanation> {
  const res = await authFetch(
    `${API_BASE_URL}/api/v1/practice/flagged-questions/${flaggedQuestionId}/explain`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export async function checkFlaggedAnswer(
  flaggedQuestionId: number,
  submittedAnswer: string,
): Promise<CheckFlaggedAnswerResponse> {
  const res = await authFetch(
    `${API_BASE_URL}/api/v1/practice/flagged-questions/${flaggedQuestionId}/check`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submitted_answer: submittedAnswer }),
    },
  );
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export async function requestFlaggedHint(
  flaggedQuestionId: number,
  attempts: number,
  hintsUsed: number,
  requestedFullSolution: boolean,
): Promise<HintResponse> {
  const res = await authFetch(
    `${API_BASE_URL}/api/v1/practice/flagged-questions/${flaggedQuestionId}/hint`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attempts,
        hints_used: hintsUsed,
        requested_full_solution: requestedFullSolution,
      }),
    },
  );
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}
