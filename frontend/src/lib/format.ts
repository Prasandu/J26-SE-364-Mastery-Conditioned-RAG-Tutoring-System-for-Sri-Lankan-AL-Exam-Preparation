// Plain helpers. No React in here, so they are easy to test.

import type { PaperSummary } from "@/api/types";

export function marks(value: number | null): string {
  if (value === null) {
    return "";
  }
  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(1);
  return `${rounded} ${value === 1 ? "mark" : "marks"}`;
}

export function paperSubtitle(paper: PaperSummary): string {
  const kind = paper.kind === "past" ? "Past paper" : "Model paper";
  return paper.year ? `${kind} - ${paper.year}` : kind;
}

/** "1" + "(b)" + "(i)" -> "1(b)(i)", the way the marking scheme writes it. */
export function fullLabel(parentLabel: string, label: string): string {
  return parentLabel + label;
}
