import type { ReactNode } from "react";

const TONES = {
  neutral: "bg-slate-100 text-slate-700",
  good: "bg-brand-50 text-brand-700 ring-1 ring-brand-200",
  warn: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  bad: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
