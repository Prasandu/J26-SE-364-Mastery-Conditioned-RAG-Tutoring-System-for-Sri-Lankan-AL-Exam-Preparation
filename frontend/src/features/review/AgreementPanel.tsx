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
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">Marker agreement</h2>
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
          <Table rows={BLIND_ROWS} data={data} />
          <p className="mt-2 text-xs text-slate-500">
            Blind decisions only: {data.blind_points} of {data.reviewed_points}. These are the
            figures to report, because a teacher who had already read the machine's answer may
            simply have agreed with it.
          </p>

          <details className="mt-5">
            <summary className="cursor-pointer text-sm text-slate-500">
              Show every reviewed point, blind or not
            </summary>
            <Table rows={ALL_ROWS} data={data} />
          </details>
        </>
      )}
    </Card>
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
      <td className="py-2 text-right tabular-nums text-teal-700">{value.agree}</td>
      <td className="py-2 text-right tabular-nums text-rose-700">{value.disagree}</td>
      <td className="py-2 text-right font-medium tabular-nums">
        {value.agreement_pct === null ? "-" : `${value.agreement_pct.toFixed(1)}%`}
      </td>
    </tr>
  );
}
