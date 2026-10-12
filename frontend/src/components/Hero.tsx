import type { ReactNode } from "react";

interface Props {
  readonly eyebrow?: string;
  readonly title: string;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
  readonly aside?: ReactNode;
}

/**
 * The banner at the top of a page: light glass, with room for a picture beside it.
 *
 * Kept small on purpose - this introduces a page, it does not compete with the
 * actual feature below it for the user's attention.
 */
export function Hero({ eyebrow, title, children, actions, aside }: Props) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/70 shadow-xl shadow-brand-900/5 backdrop-blur-xl">
      <div
        className={`grid items-center gap-6 px-5 py-4 sm:px-7 sm:py-5 ${
          aside ? "lg:grid-cols-[1.1fr_0.9fr]" : ""
        }`}
      >
        <div className={aside ? "" : "max-w-2xl"}>
          {eyebrow && (
            <p className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-brand-600">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-1.5 text-xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-2xl">
            {title}
          </h1>
          {children && <div className="mt-1.5 text-sm text-slate-600">{children}</div>}
          {actions && <div className="mt-4 flex flex-wrap gap-3">{actions}</div>}
        </div>
        {aside}
      </div>
    </section>
  );
}

/** A centred heading above a block of content. */
export function SectionTitle({ children, lead }: { children: ReactNode; lead?: string }) {
  return (
    <div className="mx-auto mb-7 max-w-2xl text-center">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {children}
      </h2>
      {lead && <p className="mt-2 text-slate-600">{lead}</p>}
    </div>
  );
}
