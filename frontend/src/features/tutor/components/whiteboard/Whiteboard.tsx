import { useMemo, useState } from "react";

import type { ValidatedTeaching, VerifiedStep } from "../../types/teaching";

/**
 * TUT-014 whiteboard. Renders only what the server verified:
 * - a rejected response shows a plain notice, never its content;
 * - steps appear in the order of the response's writeEquation actions, one at a time
 *   (the student controls the pace) or all at once;
 * - action types this renderer does not know are ignored, never executed;
 * - everything is plain text in an ordered list, so it works with a screen reader and
 *   without animation or audio.
 */
export function Whiteboard({ result }: { result: ValidatedTeaching }) {
  const response = result.status === "rejected" ? null : result.response;
  const stepsById = useMemo(
    () => new Map((response?.verified_steps ?? []).map((step) => [step.id, step])),
    [response],
  );
  const given = (response?.verified_steps ?? []).filter((step) => step.kind === "given");
  const sequence = useMemo(() => {
    const ordered: VerifiedStep[] = [];
    for (const action of response?.visual_actions ?? []) {
      if (action.type !== "writeEquation") continue;
      const step = stepsById.get(action.step_id);
      if (step && !ordered.includes(step)) ordered.push(step);
    }
    return ordered;
  }, [response, stepsById]);
  const highlighted = new Set(
    (response?.visual_actions ?? [])
      .filter((action) => action.type === "highlightStep")
      .map((action) => ("step_id" in action ? action.step_id : "")),
  );
  const [shown, setShown] = useState(1);

  if (!response) {
    return (
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">
        This working could not be checked, so it is not shown. Ask your teacher, or ask the
        tutor for a plain explanation.
      </p>
    );
  }

  const visible = sequence.slice(0, shown);
  return (
    <section aria-label="Worked solution" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      {result.status === "partially_verified" ? (
        <p className="text-xs text-slate-500" role="note">
          Every number below was checked. Some display details could not be checked and were left out.
        </p>
      ) : null}
      {given.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-ink">Given</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {given.map((step) => (
              <li key={step.id}>
                {step.label ? `${step.label}: ` : ""}
                <span className="font-mono">{step.result}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ol className="space-y-2" aria-label="Steps">
        {visible.map((step) => (
          <li
            aria-current={highlighted.has(step.id) ? "step" : undefined}
            className={
              highlighted.has(step.id)
                ? "rounded-lg border-2 border-brand p-2"
                : "rounded-lg border border-slate-100 p-2"
            }
            key={step.id}
          >
            {step.label ? <p className="text-xs text-slate-500">{step.label}</p> : null}
            <p className="font-mono text-sm">
              {step.formula} = {step.result}
            </p>
          </li>
        ))}
      </ol>
      {shown < sequence.length ? (
        <div className="flex gap-2">
          <button
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white"
            onClick={() => setShown((count) => count + 1)}
            type="button"
          >
            Next step
          </button>
          <button
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            onClick={() => setShown(sequence.length)}
            type="button"
          >
            Show all steps
          </button>
        </div>
      ) : null}
      <p className="text-sm text-slate-700">{response.spoken_text}</p>
    </section>
  );
}
