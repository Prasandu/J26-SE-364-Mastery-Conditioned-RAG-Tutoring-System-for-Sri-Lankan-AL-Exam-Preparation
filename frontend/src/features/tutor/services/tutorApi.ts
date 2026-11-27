import { authFetch } from "./apiClient";
import type { AskResponse, Language, LearnerLevel } from "../types/tutor";

import { API_BASE_URL } from "./config";

export interface AskOptions {
  /** Voice chat: a short spoken answer (never a whiteboard). */
  concise?: boolean;
  /** Also ask for a server-verified whiteboard (TUT-014). */
  whiteboard?: boolean;
  learnerLevel?: LearnerLevel;
}

export async function askTutor(
  question: string,
  language: Language,
  options: AskOptions = {},
): Promise<AskResponse> {
  const { concise = false, whiteboard = false, learnerLevel } = options;
  const res = await authFetch(`${API_BASE_URL}/api/v1/tutor/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      language,
      concise,
      whiteboard,
      ...(learnerLevel ? { learner_level: learnerLevel } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }

  return res.json();
}
