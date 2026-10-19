import type { AnswerCheckResponse, HintResponse, QuestionSummary } from "../types/question";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function listQuestions(): Promise<QuestionSummary[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/questions`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export async function requestHint(
  studentId: string,
  questionCode: string,
  attempts: number,
  hintsUsed: number,
  requestedFullSolution: boolean,
): Promise<HintResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v1/questions/${questionCode}/hint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      student_id: studentId,
      attempts,
      hints_used: hintsUsed,
      requested_full_solution: requestedFullSolution,
    }),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export async function checkAnswer(
  studentId: string,
  questionCode: string,
  submittedAnswer: string,
  hintsUsed: number,
  timeSeconds: number,
): Promise<AnswerCheckResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v1/questions/${questionCode}/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      student_id: studentId,
      submitted_answer: submittedAnswer,
      hints_used: hintsUsed,
      time_seconds: timeSeconds,
    }),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}
