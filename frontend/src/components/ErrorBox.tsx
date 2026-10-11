import type { ReactNode } from "react";

export function ErrorBox({ message, hint }: { message: string; hint?: string }) {
  return (
    <div
      className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 p-4 backdrop-blur"
      role="alert"
    >
      <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-rose-600" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M12 7.5v5.5M12 16.2v.3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <div>
        <p className="font-medium text-rose-900">{message}</p>
        {hint && <p className="mt-1 text-sm text-rose-700">{hint}</p>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-brand-200 bg-white/60 p-12 text-center backdrop-blur">
      <p className="font-medium text-slate-800">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{children}</p>}
    </div>
  );
}
