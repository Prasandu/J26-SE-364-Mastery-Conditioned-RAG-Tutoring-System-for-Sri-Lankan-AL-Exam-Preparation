import type { ReactNode } from "react";

/** Page title card: a small chip label, the title, and an optional description. */
export default function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="rounded-3xl border border-slate-100 bg-white p-6 shadow-card sm:p-8">
      <span className="chip">{eyebrow}</span>
      <h2 className="mt-3 text-2xl font-bold text-ink sm:text-3xl">{title}</h2>
      {description ? <p className="mt-2 text-slate-600">{description}</p> : null}
      {children}
    </header>
  );
}
