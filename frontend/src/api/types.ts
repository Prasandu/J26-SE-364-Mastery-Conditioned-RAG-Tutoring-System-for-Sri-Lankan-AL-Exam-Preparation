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

// Attempts: one student answering one paper.

export type AttemptMode = "digital" | "paper";
export type AttemptStatus = "in_progress" | "submitted" | "marked";
export type PointStatus = "awarded" | "not_awarded" | "pending" | "needs_review";
export type MarkingMethod = "rule" | "checker" | "llm" | "teacher";

export interface AnswerOut {
  question_id: number;
  mcq_option: string | null;
  text: string | null;
  extracted_text: string | null;
  reader: string | null;
  reading_confidence: number | null;
  corrected_by_student: boolean;
  image_count: number;
  updated_at: string;
}

export interface PointResult {
  code: string;
  description: string;
  marks: number;
  status: PointStatus;
  awarded: number | null;
  method: MarkingMethod | null;
  marker: string | null;
  checker_awarded: boolean | null;
  ai_awarded: boolean | null;
  teacher_comment: string | null;
  evidence: string | null;
  reason: string | null;
  confidence: number | null;
}

export interface QuestionResult {
  question_id: number;
  section: string;
  label: string;
  max_marks: number | null;
  answer: AnswerOut | null;
  score: number | null;
  points: PointResult[];
}

export interface Attempt {
  id: string;
  paper_id: number;
  scheme_version: number;
  student_ref: string;
  mode: AttemptMode;
  status: AttemptStatus;
  score: number | null;
  max_score: number;
  started_at: string;
  submitted_at: string | null;
  marked_at: string | null;
  questions: QuestionResult[];
}

export interface AnswerInput {
  mcq_option?: string | null;
  text?: string | null;
}
