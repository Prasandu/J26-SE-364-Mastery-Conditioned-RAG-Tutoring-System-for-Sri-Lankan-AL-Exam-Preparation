import type { SolutionConcentrationInput, ValidatedTeaching } from "../types/teaching";
import { authFetch } from "./apiClient";
import { API_BASE_URL } from "./config";

/** TUT-014 Mode B: a deterministic, server-verified worked example (no AI call). */
export async function getSolutionConcentrationExample(
  input: SolutionConcentrationInput,
): Promise<ValidatedTeaching> {
  const res = await authFetch(
    `${API_BASE_URL}/api/v1/teaching/worked-examples/solution-concentration`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}
