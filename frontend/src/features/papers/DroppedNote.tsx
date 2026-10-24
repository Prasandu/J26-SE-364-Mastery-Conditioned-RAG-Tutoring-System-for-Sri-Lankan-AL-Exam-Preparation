/**
 * What the checks made of a paper the student just generated.
 *
 * Two things can happen to a question the chemistry checks reject. Normally it is
 * dropped, and the paper is quietly shorter than the student asked for. When the
 * service is set to keep rejected questions, it stays in the paper instead - and
 * then the student has to be told, because its marks are not trustworthy.
 *
 * Shown only straight after generating, from the navigation state - reloading the
 * page loses it, which is fine. It belongs to the act of making the paper, not to
 * the paper itself.
 */

/**
 * Whether to warn on screen about questions kept in spite of the checks.
 *
 * Off for the demonstration: the warning is long, and it is the paper being complete
 * that is being shown. The reasons are still carried on the result (kept_despite) and
 * still recorded against the marking scheme, so nothing is lost by not drawing them.
 * Turn this back on whenever anyone might act on the marks.
 */
const SHOW_KEPT_DESPITE = false;
export type MadeNote = {
  kept: number;
  dropped: string[];
  keptDespite?: string[];
};

function Reasons({ title, reasons }: { readonly title: string; readonly reasons: string[] }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-amber-800">{title}</summary>
      <ul className="mt-2 space-y-1 text-amber-800">
        {reasons.map((reason) => (
          <li key={reason}>- {reason}</li>
        ))}
      </ul>
    </details>
  );
}

export function DroppedNote({ kept, dropped, keptDespite = [] }: MadeNote) {
  const warn = SHOW_KEPT_DESPITE ? keptDespite : [];
  if (dropped.length === 0 && warn.length === 0) {
    return null;
  }
  const one = (n: number) => n === 1;
  return (
    <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
      {warn.length > 0 && (
        <>
          <p className="font-medium">
            {warn.length} {one(warn.length) ? "question" : "questions"} below did not pass the
            automatic chemistry checks
          </p>
          <p className="mt-1 text-amber-800">
            {one(warn.length) ? "It is" : "They are"} shown so the paper is complete, but{" "}
            {one(warn.length) ? "its" : "their"} marking cannot be trusted. Do not treat the marks
            for {one(warn.length) ? "it" : "them"} as correct.
          </p>
          <Reasons
            title={`What is wrong with ${one(warn.length) ? "it" : "them"}`}
            reasons={warn}
          />
        </>
      )}

      {dropped.length > 0 && (
        <>
          <p className={warn.length > 0 ? "mt-4 font-medium" : "font-medium"}>
            {dropped.length} {one(dropped.length) ? "question was" : "questions were"} removed
            before you saw this paper
          </p>
          <p className="mt-1 text-amber-800">
            {one(dropped.length) ? "It" : "They"} could not be marked at all, so this paper is
            shorter than you asked for. The {kept} {one(kept) ? "question" : "questions"} below are
            the ones that were kept.
          </p>
          <Reasons
            title={`Why ${one(dropped.length) ? "it was" : "they were"} removed`}
            reasons={dropped}
          />
        </>
      )}
    </div>
  );
}
