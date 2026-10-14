import { useMemo, useState } from "react";

import type { ReviewItem } from "@/api/types";
import { Badge } from "@/components/Badge";
import type { ReviewReasonCode } from "@/lib/reviewReason";
import { reviewReason, REVIEW_REASON_LABELS } from "@/lib/reviewReason";

import { ReviewCard } from "./ReviewCard";

type Filter = ReviewReasonCode | "all";

interface AttemptGroup {
  attemptId: string;
  paperTitle: string;
  items: ReviewItem[];
}

interface StudentGroup {
  studentRef: string;
  attempts: AttemptGroup[];
  count: number;
}

/**
 * Student -> paper/attempt -> questions, instead of every unsure point across
 * every student and every paper in one flat list - a teacher working through this
 * needs to stay with one student's one script at a time, not jump papers mid-way.
 *
 * Order follows the queue itself (oldest first, same as the API returns it), not
 * an alphabetical re-sort - that would bury the points waiting longest.
 */
function groupByStudentThenPaper(items: ReviewItem[]): StudentGroup[] {
  const byStudent = new Map<string, Map<string, AttemptGroup>>();

  for (const item of items) {
    let attempts = byStudent.get(item.student_ref);
    if (!attempts) {
      attempts = new Map();
      byStudent.set(item.student_ref, attempts);
    }
    let group = attempts.get(item.attempt_id);
    if (!group) {
      group = { attemptId: item.attempt_id, paperTitle: item.paper_title, items: [] };
      attempts.set(item.attempt_id, group);
    }
    group.items.push(item);
  }

  return [...byStudent.entries()].map(([studentRef, attempts]) => {
    const groups = [...attempts.values()];
    return { studentRef, attempts: groups, count: groups.reduce((total, g) => total + g.items.length, 0) };
  });
}

interface Props {
  readonly items: ReviewItem[];
  readonly deciding: number | null;
  readonly onDecide: (item: ReviewItem, awarded: boolean, comment: string, peeked: boolean) => void;
}

const FILTERS: Filter[] = ["all", "ai_not_run", "low_confidence", "evidence_not_found", "disagreement"];

export function ReviewQueue({ items, deciding, onDecide }: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const byReason: Record<Filter, number> = {
      all: items.length,
      ai_not_run: 0,
      low_confidence: 0,
      evidence_not_found: 0,
      disagreement: 0,
    };
    for (const item of items) {
      const reason = reviewReason(item);
      if (reason) {
        byReason[reason.code] += 1;
      }
    }
    return byReason;
  }, [items]);

  const shown = filter === "all" ? items : items.filter((item) => reviewReason(item)?.code === filter);
  const students = groupByStudentThenPaper(shown);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            disabled={option !== "all" && counts[option] === 0}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              filter === option
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {option === "all" ? "All" : REVIEW_REASON_LABELS[option]} ({counts[option]})
          </button>
        ))}
      </div>

      {shown.length === 0 && (
        <p className="text-sm text-slate-500">Nothing in this category right now.</p>
      )}

      {students.map((student) => (
        <details
          key={student.studentRef}
          open
          className="overflow-hidden rounded-3xl border border-white/70 bg-white/80 shadow-lg shadow-brand-900/5 backdrop-blur-xl"
        >
          <summary className="flex cursor-pointer list-none items-center gap-3 p-5 sm:p-6">
            <span className="font-medium text-slate-800">{student.studentRef}</span>
            <Badge>
              {student.count} {student.count === 1 ? "point" : "points"}
            </Badge>
          </summary>

          <div className="space-y-4 border-t border-slate-100 p-5 pt-4 sm:p-6 sm:pt-4">
            {student.attempts.map((attempt) => (
              <details key={attempt.attemptId} open className="rounded-2xl border border-slate-200">
                <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm">
                  <span className="font-medium text-slate-700">{attempt.paperTitle}</span>
                  <Badge>
                    {attempt.items.length} {attempt.items.length === 1 ? "point" : "points"}
                  </Badge>
                </summary>
                <div className="space-y-4 border-t border-slate-100 p-3 pt-3">
                  {attempt.items.map((item) => (
                    <ReviewCard
                      key={item.id}
                      item={item}
                      busy={deciding === item.id}
                      onDecide={(awarded, comment, peeked) => onDecide(item, awarded, comment, peeked)}
                    />
                  ))}
                </div>
              </details>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
