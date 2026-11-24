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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "11 Oct 2026, 14:05" in the reader's own timezone. Built by hand, so it never
 * changes shape between browsers the way toLocaleString does. */
export function when(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return iso;
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`;
  return `${day}, ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
