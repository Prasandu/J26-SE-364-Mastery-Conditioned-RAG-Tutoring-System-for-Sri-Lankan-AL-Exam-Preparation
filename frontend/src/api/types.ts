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

// Teacher review: points the machine was not confident about.

export interface ReviewItem {
  id: number;
  attempt_id: string;
  student_ref: string;
  submitted_at: string | null;
  paper_title: string;
  section: string;
  question: string;
  question_text: string;
  model_answer: string | null;
  code: string;
  description: string;
  marks: number;
  student_text: string | null;
  student_mcq_option: string | null;
  status: PointStatus;
  checker_awarded: boolean | null;
  ai_awarded: boolean | null;
  machine_evidence: string | null;
  machine_reason: string | null;
  confidence: number | null;
  marker: string | null;
}

export interface ReviewDecision {
  awarded: boolean;
  teacher_ref: string;
  comment?: string | null;
  saw_machine: boolean; // did the teacher read the machine's decision first?
}

export interface ReviewedPoint {
  id: number;
  status: PointStatus;
  awarded: number;
  method: MarkingMethod | null;
  teacher_awarded: boolean | null;
  teacher_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface MarkerAgreement {
  judged: number;
  agree: number;
  disagree: number;
  agreement_pct: number | null;
}

export interface Agreement {
  reviewed_points: number;
  checker_vs_teacher: MarkerAgreement;
  ai_vs_teacher: MarkerAgreement;
  checker_vs_ai: MarkerAgreement;
  blind_points: number;
  blind_checker_vs_teacher: MarkerAgreement;
  blind_ai_vs_teacher: MarkerAgreement;
}

export interface ReviewScript {
  attempt_id: string;
  student_ref: string;
  paper_id: number;
  paper_title: string;
  submitted_at: string | null;
  total_points: number;
  reviewed_points: number;
  machine_score: number | null;
  max_score: number;
}

export interface SheetAnswer {
  question_id: number;
  label: string;
  option: string | null;
  state: "filled" | "blank" | "unsure";
  already: string | null;
}

export interface SheetRead {
  read_by: string;
  questions_found: number;
  options_found: number;
  answers: SheetAnswer[];
}

// Topics and generating a model paper.

export interface Topic {
  id: number;
  code: string;
  name: string;
  parent_id: number | null;
}

export interface Counts {
  mcq: number;
  structured: number;
  essay: number;
}

export interface SectionShape {
  code: string;
  title: string;
  answer_mode: AnswerMode;
  count: number;
  marks: number;
  minutes: number;
}

export interface Shape {
  title: string;
  sections: SectionShape[];
  questions: number;
  marks: number;
  minutes: number;
  duration: string;
  problems: string[];
}

export interface Rates {
  minutes_per_question: Record<string, number>;
  marks_per_question: Record<string, number>;
  round_to_minutes: number;
  max_per_section: number;
}

export interface GeneratedPaper {
  paper_id: number;
  scheme_version: number;
  title: string;
  written_by: string;
  kept: number;
  dropped: string[];
  shape: Shape;
}

export interface PracticeLimits {
  per_day: number;
  made_today: number;
  questions_at_once: number;
}
