import type { QuestionTable } from "@/api/types";

/** Tabulated data a question refers to (e.g. experimental readings) - a real table,
 * not a picture of one, since the system has no way to show a diagram or graph
 * within a question's own wording. */
export function DataTable({ table }: { readonly table: QuestionTable }) {
  return (
    <table className="mt-2 border-collapse text-sm">
      <thead>
        <tr>
          {table.headers.map((header, index) => (
            <th
              key={index}
              className="border border-slate-200 bg-slate-50 px-3 py-1.5 text-left font-medium text-slate-700"
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className="border border-slate-200 px-3 py-1.5 text-slate-700">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
