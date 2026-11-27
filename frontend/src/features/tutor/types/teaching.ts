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

// Schema 1.1 blocks. The server checked them (balanced equations, table shape, no markup);
// the renderer still treats every string as plain text.
export type WhiteboardBlock =
  | { type: "text"; text: string }
  | { type: "table"; caption: string; headers: string[]; rows: string[][] }
  | {
      type: "chem_equation";
      reactants: { coefficient: number; formula: string }[];
      products: { coefficient: number; formula: string }[];
      arrow: "->" | "<=>";
    };

export interface TeachingResponse {
  schema_version?: "1.0" | "1.1";
  response_id: string;
  language: "en" | "si";
  spoken_text: string;
  citations: { source_id: string; page: number | null }[];
  verified_steps: VerifiedStep[];
  visual_actions: VisualAction[];
  learning_mode: "worked_example" | "socratic" | "quick_explanation";
  blocks?: WhiteboardBlock[];
  ai_generated?: true;
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
