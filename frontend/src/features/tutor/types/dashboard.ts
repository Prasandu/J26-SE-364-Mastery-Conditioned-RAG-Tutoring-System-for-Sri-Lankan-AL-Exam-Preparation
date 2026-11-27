export interface QuestionProgress {
  question_code: string;
  attempts: number;
  correct_attempts: number;
  independent_successes: number;
  assisted_successes: number;
  hints_used_total: number;
}

export interface Dashboard {
  total_attempts: number;
  total_correct: number;
  total_independent: number;
  total_assisted: number;
  total_hints_used: number;
  independent_rate: number;
  per_question: QuestionProgress[];
}

export interface InterventionHistoryItem {
  rule: string;
  message: string;
  question_code: string | null;
  unit: string | null;
  created_at: string;
}
