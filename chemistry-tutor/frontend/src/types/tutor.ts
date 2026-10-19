export type Language = "en" | "si";

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
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
  grounded?: boolean;
}
