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
  student_text: string | null; // what the student confirmed, and what is marked
  // Paper mode: what the camera read before the student corrected it. A lost mark can
  // be the chemistry or the handwriting, and the teacher has to see which.
  student_extracted_text: string | null;
  corrected_by_student: boolean;
  read_by: string | null;
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
  teacher_saw_machine: boolean | null; // null means the decision predates blind review
  decisions: number; // how many times this point has been decided
}

/** One entry in a marking point's decision history, oldest first. */
export interface PointReview {
  id: number;
  awarded: boolean;
  comment: string | null;
  teacher_ref: string;
  saw_machine: boolean | null;
  decided_at: string;
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
  dropped: string[]; // questions the checks rejected, with the reason
  attempts: number; // how many times the model had to be asked
  checked_by: string[]; // which validators ran
  needs_teacher: string[]; // findings no check could settle; the paper is usable
  shape: Shape;
}

// The marking scheme lifecycle: draft -> validated -> approved -> published -> retired,
// with validation_failed (and back) alongside draft/validated.
export type SchemeStatus =
  "draft" | "validation_failed" | "validated" | "approved" | "published" | "retired";

export type SchemeSource = "official" | "teacher" | "generated";

export interface SchemeSummary {
  id: number;
  version: number;
  source: SchemeSource;
  status: SchemeStatus;
  created_at: string;
  published_at: string | null;
  validated_at: string | null;
  checked_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
}

export interface SchemeValidationOut {
  version: number;
  status: SchemeStatus;
  checked_by: string[];
  not_checked: string[];
  errors: string[];
  needs_teacher: string[];
  notes: string[];
  summary: string;
}

// Admin content management

export interface AdminPaperSummary extends PaperSummary {
  created_at: string;
  published_at: string | null;
  created_by: string | null;
  marking_schemes: SchemeSummary[];
}

export interface AdminPaperDetail extends PaperDetail {
  created_at: string;
  published_at: string | null;
  created_by: string | null;
  grounded_in: Record<string, unknown>[];
  marking_schemes: SchemeSummary[];
}

export interface PapersPageOut {
  items: AdminPaperSummary[];
  total: number;
  page: number;
  page_size: number;
}

export type SuggestionStatus = "pending" | "approved" | "rejected";

export interface TopicSuggestion {
  id: number;
  question_id: number;
  suggested_codes: string[];
  confidence: number | null;
  reason: string | null;
  model: string;
  question_text: string;
  status: SuggestionStatus;
  approved_codes: string[] | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface PracticeLimits {
  per_day: number;
  made_today: number;
  questions_at_once: number;
}
