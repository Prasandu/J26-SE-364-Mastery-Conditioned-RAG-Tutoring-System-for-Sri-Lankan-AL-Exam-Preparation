export interface WeakTopic {
  question_code: string;
  unit: string;
  topic_id: string;
  reason: string;
  prerequisite_names: string[];
}

export interface Consultation {
  has_data: boolean;
  weak_topics: WeakTopic[];
  revision_plan: string;
  wellness_tips: string[];
}
