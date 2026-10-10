// These match the Pydantic schemas in assessment-service/app/schemas/content.py.
// If the backend changes, change this file first.

export type PaperKind = "past" | "model";
export type ContentStatus = "draft" | "published";
export type AnswerMode = "mcq" | "structured" | "essay";

export interface PaperSummary {
  id: number;
  title: string;
  subject: string;
  kind: PaperKind;
  year: number | null;
  status: ContentStatus;
}

// The backend stores options as a plain string map, usually {label, text}.
export type QuestionOption = Record<string, string>;

export interface Question {
  id: number;
  label: string;
  text: string;
  max_marks: number | null;
  options: QuestionOption[] | null;
  topics: string[];
  sub_questions: Question[];
}

export interface Section {
  id: number;
  code: string;
  title: string;
  answer_mode: AnswerMode;
  choose_count: number | null;
  instructions: string | null;
  questions: Question[];
}

export interface PaperDetail extends PaperSummary {
  sections: Section[];
}

export interface Health {
  status: string;
  service: string;
  env: string;
}
