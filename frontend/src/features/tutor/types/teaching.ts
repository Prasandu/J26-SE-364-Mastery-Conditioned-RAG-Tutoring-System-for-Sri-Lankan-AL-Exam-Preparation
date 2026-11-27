// TUT-014: a server-validated teaching response (support-service app/services/teaching).

export interface VerifiedStep {
  id: string;
  kind: "given" | "unit_conversion" | "calculation";
  label: string;
  formula: string;
  result: string;
}

export type VisualAction =
  | { type: "writeEquation" | "highlightStep" | "showFormula"; step_id: string }
  | { type: "highlightTerm"; step_id: string; term: string }
  | { type: "plotPoints"; points: [number, number][]; x_label: string; y_label: string }
  | { type: "pause"; seconds: number };

export interface TeachingResponse {
  response_id: string;
  language: "en" | "si";
  spoken_text: string;
  citations: { source_id: string; page: number | null }[];
  verified_steps: VerifiedStep[];
  visual_actions: VisualAction[];
  learning_mode: "worked_example" | "socratic" | "quick_explanation";
}

export interface ValidatedTeaching {
  status: "verified" | "partially_verified" | "rejected";
  response: TeachingResponse | null;
  checks: { step_id: string; computed: number | null; unit_checked: boolean }[];
  problems: string[];
}

export interface SolutionConcentrationInput {
  solute: string;
  mass_g: number;
  molar_mass_g_per_mol: number;
  volume_cm3: number;
}
