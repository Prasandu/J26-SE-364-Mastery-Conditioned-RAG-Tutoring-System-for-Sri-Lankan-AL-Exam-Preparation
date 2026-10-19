import type { AskResponse, Language } from "../types/tutor";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function askTutor(question: string, language: Language): Promise<AskResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v1/tutor/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, language }),
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }

  return res.json();
}
