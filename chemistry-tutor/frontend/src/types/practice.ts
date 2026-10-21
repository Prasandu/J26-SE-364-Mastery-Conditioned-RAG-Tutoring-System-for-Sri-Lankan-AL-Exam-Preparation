import type { Citation } from "./tutor";

export interface FlaggedQuestion {
  id: number;
  student_id: string;
  source: string;
  question_text: string;
  topic: string;
  sub_topic: string | null;
  unit: string | null;
  concept_id: string | null;
  submitted_answer: string;
  correct_answer: string | null;
  status: "pending" | "reviewed";
  created_at: string;
}

export interface Explanation {
  explanation: string;
  citations: Citation[];
  grounded: boolean;
}

export interface CheckFlaggedAnswerResponse {
  correct: boolean | null;
}
