import { Fragment, useMemo, useState } from "react";

import type { ValidatedTeaching, VerifiedStep, WhiteboardBlock } from "../../types/teaching";
import { formulaParts } from "./formula";

type Language = "en" | "si";

// Sinhala strings are a draft translation until reviewed by an A/L Chemistry teacher.
const LABELS = {
  en: {
    rejected:
      "This working could not be checked, so it is not shown. Ask your teacher, or ask the tutor for a plain explanation.",
    partial: "Every number below was checked. Some display details could not be checked and were left out.",
    section: "Whiteboard",
    given: "Given",
    steps: "Steps",
    next: "Next step",
    showAll: "Show all steps",
    balanced: "Atoms and charge balance (checked)",
    aiNote: "AI-generated explanation, checked by the server. It is not a mark.",
  },
  si: {
    rejected:
      "මෙම විසඳුම පරීක්ෂා කළ නොහැකි වූ නිසා එය පෙන්වන්නේ නැත. ඔබේ ගුරුවරයාගෙන් අසන්න, නැතහොත් සරල පැහැදිලි කිරීමක් ඉල්ලන්න.",
    partial: "පහත සියලු සංඛ්‍යා පරීක්ෂා කර ඇත. පරීක්ෂා කළ නොහැකි සමහර විස්තර ඉවත් කර ඇත.",
    section: "පුවරුව",
    given: "දී ඇති දත්ත",
    steps: "පියවර",
    next: "ඊළඟ පියවර",
    showAll: "සියලු පියවර පෙන්වන්න",
    balanced: "පරමාණු හා ආරෝපණ තුලනය පරීක්ෂා කර ඇත",
    aiNote: "AI මගින් සැකසූ, සේවාදායකය විසින් පරීක්ෂා කළ පැහැදිලි කිරීමකි. මෙය ලකුණක් නොවේ.",
  },
} as const;

function Formula({ formula }: { formula: string }) {
  return (
    <span className="whitespace-nowrap">
      {formulaParts(formula).map((part, index) =>
        part.kind === "sub" ? (
          <sub key={index}>{part.text}</sub>
        ) : part.kind === "sup" ? (
          <sup key={index}>{part.text}</sup>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </span>
  );
}

function Side({ terms }: { terms: { coefficient: number; formula: string }[] }) {
  return (
    <>
      {terms.map((term, index) => (
        <Fragment key={index}>
          {index > 0 ? " + " : ""}
          {term.coefficient > 1 ? `${term.coefficient} ` : ""}
          <Formula formula={term.formula} />
        </Fragment>
      ))}
    </>
  );
}

function Block({ block, labels }: { block: WhiteboardBlock; labels: (typeof LABELS)[Language] }) {
  if (block.type === "text") {
    return <p className="whitespace-pre-wrap text-sm text-slate-800">{block.text}</p>;
  }
  if (block.type === "table") {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          {block.caption ? <caption className="mb-1 text-left text-xs text-slate-500">{block.caption}</caption> : null}
          <thead>
            <tr>
              {block.headers.map((header, index) => (
                <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left" key={index} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, index) => (
                  <td className="border border-slate-200 px-2 py-1" key={index}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.type === "chem_equation") {
    return (
      <figure className="rounded-lg bg-slate-50 p-2">
        <p className="text-base" data-testid="chem-equation">
          <Side terms={block.reactants} /> {block.arrow === "<=>" ? "⇌" : "→"} <Side terms={block.products} />
        </p>
        <figcaption className="text-xs text-slate-500">{labels.balanced}</figcaption>
      </figure>
    );
  }
  return null; // a block type this renderer does not know is ignored, never interpreted
}

/**
 * TUT-014 whiteboard. Renders only what the server verified:
 * - a rejected response shows a plain notice, never its content;
 * - steps appear in the order of the response's writeEquation actions, one at a time
 *   (the student controls the pace) or all at once;
 * - text, table and chemical-equation blocks are drawn from plain strings with React
 *   (no HTML injection path), and unknown block or action types are ignored;
 * - everything works with a screen reader and without animation or audio.
 */
export function Whiteboard({ result, language }: { result: ValidatedTeaching; language?: Language }) {
  const response = result.status === "rejected" ? null : result.response;
  const labels = LABELS[language ?? response?.language ?? "en"];
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
        {labels.rejected}
      </p>
    );
  }

  const visible = sequence.slice(0, shown);
  return (
    <section
      aria-label={labels.section}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4"
      lang={response.language}
    >
      {result.status === "partially_verified" ? (
        <p className="text-xs text-slate-500" role="note">
          {labels.partial}
        </p>
      ) : null}
      {(response.blocks ?? []).map((block, index) => (
        <Block block={block} key={index} labels={labels} />
      ))}
      {given.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-ink">{labels.given}</h3>
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
      {sequence.length > 0 ? (
        <ol className="space-y-2" aria-label={labels.steps}>
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
      ) : null}
      {shown < sequence.length ? (
        <div className="flex gap-2">
          <button
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white"
            onClick={() => setShown((count) => count + 1)}
            type="button"
          >
            {labels.next}
          </button>
          <button
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            onClick={() => setShown(sequence.length)}
            type="button"
          >
            {labels.showAll}
          </button>
        </div>
      ) : null}
      <p className="text-sm text-slate-700">{response.spoken_text}</p>
      <p className="text-xs text-slate-400">{labels.aiNote}</p>
    </section>
  );
}
