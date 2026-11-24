import type { Agreement, MarkerAgreement } from "@/api/types";
import { Card } from "@/components/Card";

const ALL_ROWS: { key: keyof Agreement; label: string }[] = [
  { key: "checker_vs_teacher", label: "Chemistry checker vs teacher" },
  { key: "ai_vs_teacher", label: "AI judge vs teacher" },
  { key: "checker_vs_ai", label: "Chemistry checker vs AI judge" },
];

const BLIND_ROWS: { key: keyof Agreement; label: string }[] = [
  { key: "blind_checker_vs_teacher", label: "Chemistry checker vs teacher" },
  { key: "blind_ai_vs_teacher", label: "AI judge vs teacher" },
];

/** How often each marker matched the teacher. These are the research numbers. */
export function AgreementPanel({ data }: { data: Agreement }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">Review quality</h2>
        <span className="text-sm text-slate-500">
          {data.reviewed_points} {data.reviewed_points === 1 ? "point" : "points"} reviewed by a
          teacher
        </span>
      </div>

      {data.reviewed_points === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Nothing reviewed yet. Decide some points below and the numbers appear here.
        </p>
      ) : (
        <>
          <Headline data={data} />
          <p className="mt-3 text-xs text-slate-500">
            Based on {data.blind_points} blind {data.blind_points === 1 ? "decision" : "decisions"}.
            A blind decision means the teacher decided before seeing the machine result.
          </p>

          <details className="mt-3 border-t border-slate-100 pt-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-600">
              View detailed comparisons
            </summary>
            <div className="overflow-x-auto">
              <Table rows={BLIND_ROWS} data={data} />
              <p className="mt-4 text-xs font-medium text-slate-500">All reviewed decisions</p>
              <Table rows={ALL_ROWS} data={data} />
            </div>
          </details>
        </>
      )}
    </Card>
  );
}

/**
 * The one number most asked about: how accurate the AI judge actually is against a
 * teacher's blind decision. Everything else on this page explains or qualifies it,
 * so it gets the big callout, not just a row in the table below.
 */
function Headline({ data }: { readonly data: Agreement }) {
  const ai = data.blind_ai_vs_teacher;
  const checker = data.blind_checker_vs_teacher;
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Stat label="AI agreement" tone="good" value={ai} />
      <Stat label="Checker agreement" tone="neutral" value={checker} />
    </div>
  );
}

function Stat({
  label,
  tone,
  value,
}: {
  readonly label: string;
  readonly tone: "good" | "neutral";
  readonly value: MarkerAgreement;
}) {
  const background = tone === "good" ? "bg-brand-50 ring-brand-100" : "bg-slate-50 ring-slate-100";
  return (
    <div className={`rounded-xl p-4 ring-1 ${background}`}>
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
        {value.agreement_pct === null ? "-" : `${value.agreement_pct.toFixed(1)}%`}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {value.judged === 0 ? "No blind decisions yet" : `Agreed on ${value.agree} of ${value.judged} blind decisions`}
      </p>
    </div>
  );
}

function Table({ rows, data }: { rows: typeof ALL_ROWS; data: Agreement }) {
  return (
    <table className="mt-4 w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="pb-2 font-normal">Comparison</th>
          <th className="pb-2 text-right font-normal">Judged</th>
          <th className="pb-2 text-right font-normal">Agree</th>
          <th className="pb-2 text-right font-normal">Disagree</th>
          <th className="pb-2 text-right font-normal">Agreement</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => (
          <Row key={row.key} label={row.label} value={data[row.key] as MarkerAgreement} />
        ))}
      </tbody>
    </table>
  );
}

function Row({ label, value }: { label: string; value: MarkerAgreement }) {
  return (
    <tr>
      <td className="py-2 text-slate-700">{label}</td>
      <td className="py-2 text-right tabular-nums text-slate-500">{value.judged}</td>
      <td className="py-2 text-right tabular-nums text-brand-700">{value.agree}</td>
      <td className="py-2 text-right tabular-nums text-rose-700">{value.disagree}</td>
      <td className="py-2 text-right font-medium tabular-nums">
        {value.agreement_pct === null ? "-" : `${value.agreement_pct.toFixed(1)}%`}
      </td>
    </tr>
  );
}
