import type { Counts, Rates } from "@/api/types";

export const ORDER: { key: keyof Counts; label: string; mode: string }[] = [
  { key: "mcq", label: "Multiple choice", mode: "mcq" },
  { key: "structured", label: "Structured", mode: "structured" },
  { key: "essay", label: "Essay", mode: "essay" },
];

export interface Shape {
  questions: number;
  marks: number;
  minutes: number;
  duration: string;
}

/**
 * The paper's size and duration, worked out as the counts are typed.
 *
 * The rates come from the service, so there is still only one place that decides how
 * long a question takes. Doing the arithmetic here just means the person sees it
 * change immediately instead of after a round trip.
 */
export function shapeFrom(counts: Counts, rates: Rates): Shape {
  let questions = 0;
  let marks = 0;
  let minutes = 0;

  for (const { key, mode } of ORDER) {
    const count = counts[key];
    questions += count;
    marks += count * (rates.marks_per_question[mode] ?? 0);
    minutes += count * (rates.minutes_per_question[mode] ?? 0);
  }

  const step = rates.round_to_minutes || 1;
  const rounded = Math.ceil(minutes / step) * step;
  return { questions, marks, minutes: rounded, duration: spell(rounded) };
}

function spell(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts: string[] = [];
  if (hours) {
    parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  }
  if (rest || !hours) {
    parts.push(`${rest} minute${rest === 1 ? "" : "s"}`);
  }
  return parts.join(" ");
}
