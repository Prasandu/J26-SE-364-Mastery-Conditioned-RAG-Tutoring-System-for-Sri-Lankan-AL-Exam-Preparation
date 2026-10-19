export interface QuestionEvidence {
  question_code: string;
  unit: string;
  status: "independent" | "assisted" | "struggling";
  explanation: string;
}

export interface CorrectedAnswer {
  question_code: string;
  question_text: string;
  wrong_answers: string[];
  theory_explanation: string;
  worked_solution: string;
  final_answer: string;
}

export interface WivaranaReport {
  student_id: string;
  generated_at: string;
  total_attempts: number;
  total_correct: number;
  independent_rate: number;
  question_evidence: QuestionEvidence[];
  corrected_answers: CorrectedAnswer[];
  intervention_summary: string[];
  narrative: string;
}
