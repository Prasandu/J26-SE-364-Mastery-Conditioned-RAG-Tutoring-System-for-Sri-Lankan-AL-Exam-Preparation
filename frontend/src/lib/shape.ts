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

  // Up to a whole half minute, matching the service - a one-question paper is
  // 2.4 minutes, and rounding that to five would hand out twice the time.
  const step = rates.round_to_seconds || 1;
  const rounded = (Math.ceil((minutes * 60) / step) * step) / 60;
  return { questions, marks, minutes: rounded, duration: spell(rounded) };
}

function spell(minutes: number): string {
  const total = Math.round(minutes * 60);
  const hours = Math.floor(total / 3600);
  const whole = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (hours) {
    parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  }
  if (whole || !(hours || seconds)) {
    parts.push(`${whole} minute${whole === 1 ? "" : "s"}`);
  }
  if (seconds) {
    parts.push(`${seconds} second${seconds === 1 ? "" : "s"}`);
  }
  return parts.join(" ");
}
