import type { ValidatedTeaching } from "./teaching";

export type Language = "en" | "si";
/** The student's planner (C3) mastery band; only changes how deep explanations go. */
export type LearnerLevel = "weak" | "developing" | "strong";

export interface Citation {
  document_title: string;
  unit: string | null;
  section: string | null;
  page_number: number | null;
}

export interface AskResponse {
  answer: string;
  citations: Citation[];
  grounded: boolean;
  whiteboard?: ValidatedTeaching | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
  grounded?: boolean;
  whiteboard?: ValidatedTeaching | null;
}
