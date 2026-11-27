import { authFetch } from "./apiClient";
import type { AskResponse, Language } from "../types/tutor";

import { API_BASE_URL } from "./config";

export async function askTutor(
  question: string,
  language: Language,
  concise = false,
): Promise<AskResponse> {
  const res = await authFetch(`${API_BASE_URL}/api/v1/tutor/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, language, concise }),
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }

  return res.json();
}
