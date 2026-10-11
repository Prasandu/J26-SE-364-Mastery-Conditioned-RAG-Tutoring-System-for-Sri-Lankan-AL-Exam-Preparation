export type StepState = "done" | "doing" | "waiting";

export interface Step {
  label: string;
  detail?: string;
  state: StepState;
}

/**
 * What is happening now, what is finished, and what is still to come.
 *
 * Shown whenever the person has to wait for something they cannot see. A bare
 * spinner tells them nothing, so they wonder whether it has frozen.
 */
export function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-3" aria-live="polite">
      {steps.map((step) => (
        <li key={step.label} className="flex gap-3">
          <Mark state={step.state} />
          <div className="min-w-0">
            <p
              className={
                step.state === "waiting"
                  ? "text-sm text-slate-400"
                  : "text-sm font-medium text-slate-800"
              }
            >
              {step.label}
            </p>
            {step.detail && step.state !== "waiting" && (
              <p className="text-xs text-slate-500">{step.detail}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Mark({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" aria-hidden="true">
          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (state === "doing") {
    return (
      <span className="mt-0.5 size-5 shrink-0 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
    );
  }
  return <span className="mt-0.5 size-5 shrink-0 rounded-full border-2 border-slate-200" />;
}

/** A bar that fills as work is done, with the count written beside it. */
export function WorkBar({ done, total, label }: { done: number; total: number; label: string }) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="tabular-nums text-slate-500">
          {done} of {total}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-brand-400 transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
