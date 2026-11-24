import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: Props) {
  return (
    <div
      className={`rounded-3xl border border-white/70 bg-white/80 p-5 shadow-lg shadow-brand-900/5 backdrop-blur-xl sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionHeading({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-lg font-medium tracking-tight">{children}</h2>
      {hint && <p className="text-sm text-slate-500">{hint}</p>}
    </div>
  );
}
