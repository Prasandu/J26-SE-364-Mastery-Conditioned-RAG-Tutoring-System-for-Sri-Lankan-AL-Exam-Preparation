import type { ReviewItem } from "@/api/types";

// Mirrors Settings.ai_min_confidence's default in app/config.py - below this, an AI
// verdict is not trusted on its own. There is no per-request value on ReviewItem,
// so this is the one used to label "low confidence" here; a deployment that changes
// the setting would make this label slightly off, same trade-off the badge accepts
// for not needing another field just to describe itself.
const LOW_CONFIDENCE_BELOW = 0.7;

export type ReviewReasonCode = "ai_not_run" | "low_confidence" | "evidence_not_found" | "disagreement";

export interface ReviewReason {
  code: ReviewReasonCode;
  label: string;
}

/**
 * Why this point is waiting for a teacher, in process terms - never the AI's actual
 * award/no-award opinion, which stays behind MachineOpinion's "decide first" gate.
 * Saying *that* a confidence number was low, or that the AI never ran at all, does
 * not anchor a teacher toward a particular verdict the way seeing the verdict itself
 * would.
 *
 * Worked out from fields already on ReviewItem (no new API field):
 * - ai_awarded is null and no AI model is named  -> the point never went to the AI at
 *   all (e.g. a drawing, which only a teacher can mark).
 * - ai_awarded is null but an AI model is named   -> the AI was asked and did not
 *   return a usable decision (no verdict, or the quota ran out).
 * - a confidence number exists and is below the threshold -> low confidence.
 * - a confidence number exists at or above the threshold  -> the AI was confident,
 *   but its quoted evidence could not be verified in the student's own answer.
 * - ai_awarded is set but confidence is null and a checker ran too -> the chemistry
 *   checker and the AI judge reached different verdicts.
 */
export function reviewReason(item: ReviewItem): ReviewReason | null {
  if (item.status !== "needs_review") {
    return null;
  }
  if (item.ai_awarded === null) {
    return item.marker
      ? { code: "ai_not_run", label: "AI gave no usable decision" }
      : { code: "ai_not_run", label: "Never sent to the AI" };
  }
  if (item.confidence !== null) {
    return item.confidence < LOW_CONFIDENCE_BELOW
      ? { code: "low_confidence", label: `Low AI confidence (${Math.round(item.confidence * 100)}%)` }
      : { code: "evidence_not_found", label: "AI evidence not found in the answer" };
  }
  return { code: "disagreement", label: "Checker and AI judge disagreed" };
}

export const REVIEW_REASON_LABELS: Record<ReviewReasonCode, string> = {
  ai_not_run: "AI did not process this",
  low_confidence: `AI confidence below ${Math.round(LOW_CONFIDENCE_BELOW * 100)}%`,
  evidence_not_found: "AI evidence not verified",
  disagreement: "Checker vs AI disagreement",
};
