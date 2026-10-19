export interface QuestionSummary {
  question_code: string;
  topic_id: string;
  unit: string;
  question_text: string;
  difficulty: string;
}

export interface HintResponse {
  level: number;
  level_name: string;
  content: string;
}

export interface AnswerCheckResponse {
  correct: boolean;
  independent_success: boolean;
}
