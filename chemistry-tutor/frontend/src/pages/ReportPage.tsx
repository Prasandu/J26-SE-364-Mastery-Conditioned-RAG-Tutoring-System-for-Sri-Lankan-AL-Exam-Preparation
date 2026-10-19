import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import { getWivaranaReport } from "../services/studentsApi";
import type { WivaranaReport } from "../types/report";

const STATUS_STYLE: Record<string, string> = {
  independent: "text-green-700 bg-green-50 border-green-200",
  assisted: "text-amber-700 bg-amber-50 border-amber-200",
  struggling: "text-red-700 bg-red-50 border-red-200",
};

const STATUS_LABEL: Record<string, string> = {
  independent: "Independent",
  assisted: "Assisted",
  struggling: "Struggling",
};

export function ReportPage() {
  const [studentId, setStudentId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");

  const [report, setReport] = useState<WivaranaReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);

  async function downloadPdf() {
    if (!reportRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2 });
      const imgData = canvas.toDataURL("image/jpeg", 0.98);

      const pdf = new jsPDF("p", "mm", "a4");
      const margin = 10;
      const pageWidth = 210;
      const pageHeight = 297;
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const usablePageHeight = pageHeight - margin * 2;

      let heightLeft = imgHeight;
      let position = margin;
      pdf.addImage(imgData, "JPEG", margin, position, imgWidth, imgHeight);
      heightLeft -= usablePageHeight;

      while (heightLeft > 0) {
        position = margin - (imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", margin, position, imgWidth, imgHeight);
        heightLeft -= usablePageHeight;
      }

      pdf.save(`wivarana-report-${studentId}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
      setError(err instanceof Error ? `Could not generate PDF: ${err.message}` : "Could not generate PDF");
    } finally {
      setDownloading(false);
    }
  }

  function loadReport(id: string) {
    setLoading(true);
    setError(null);
    getWivaranaReport(id)
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load report"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (studentId) loadReport(studentId);
  }, [studentId]);

  if (!studentId) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="w-80 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-2 text-lg font-semibold">Wivarana Report</h2>
          <p className="mb-3 text-sm text-gray-500">An explanation-based learning report.</p>
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="Student name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && nameInput.trim() && setStudentId(nameInput.trim())}
          />
          <button
            onClick={() => nameInput.trim() && setStudentId(nameInput.trim())}
            disabled={!nameInput.trim()}
            className="mt-3 w-full rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Generate Report
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <h1 className="text-lg font-semibold">Wivarana Report: {studentId}</h1>
          <div className="flex gap-3">
            {report && (
              <button
                type="button"
                onClick={downloadPdf}
                disabled={downloading}
                className="text-sm text-blue-600 underline disabled:opacity-50"
              >
                {downloading ? "Preparing PDF..." : "Download PDF"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setStudentId(null)}
              className="text-sm text-blue-600 underline"
            >
              Switch student
            </button>
          </div>
        </div>

        {loading && <p className="text-gray-400">Generating report...</p>}
        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">Could not load report: {error}</p>
            <button
              onClick={() => loadReport(studentId)}
              className="mt-2 rounded bg-red-600 px-3 py-1.5 text-sm text-white"
            >
              Retry
            </button>
          </div>
        )}

        {report && (
          <div ref={reportRef} className="rounded-lg border bg-white p-6">
            <p className="text-xs text-gray-400">
              Generated {new Date(report.generated_at).toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-gray-600">
              {report.total_correct} / {report.total_attempts} correct overall —{" "}
              {Math.round(report.independent_rate * 100)}% independent
            </p>

            <h2 className="mt-4 text-sm font-semibold text-gray-700">Explanation</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{report.narrative}</p>

            {report.question_evidence.length > 0 && (
              <>
                <h2 className="mt-4 text-sm font-semibold text-gray-700">Evidence by question</h2>
                <ul className="mt-2 space-y-2">
                  {report.question_evidence.map((e) => (
                    <li
                      key={e.question_code}
                      className={`rounded border p-2 text-sm ${STATUS_STYLE[e.status] ?? ""}`}
                    >
                      <span className="font-medium">
                        {e.question_code} (Unit {e.unit}) — {STATUS_LABEL[e.status] ?? e.status}
                      </span>
                      <p className="mt-1 text-gray-700">{e.explanation}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {report.corrected_answers.length > 0 && (
              <>
                <h2 className="mt-4 text-sm font-semibold text-gray-700">
                  Corrected Answers — step by step
                </h2>
                <div className="mt-2 space-y-4">
                  {report.corrected_answers.map((c) => (
                    <div key={c.question_code} className="rounded border border-red-200 p-3">
                      <p className="text-sm font-medium text-gray-800">
                        {c.question_code}: {c.question_text}
                      </p>
                      <p className="mt-1 text-sm text-red-700">
                        Your answer{c.wrong_answers.length > 1 ? "s" : ""}:{" "}
                        {c.wrong_answers.join(", ")}
                      </p>

                      <p className="mt-2 text-xs font-semibold uppercase text-gray-500">
                        Theory
                      </p>
                      <p className="text-sm text-gray-700">{c.theory_explanation}</p>

                      <p className="mt-2 text-xs font-semibold uppercase text-gray-500">
                        Step by step
                      </p>
                      <p className="whitespace-pre-wrap text-sm text-gray-700">
                        {c.worked_solution}
                      </p>

                      <p className="mt-2 text-xs font-semibold uppercase text-gray-500">
                        Correct answer
                      </p>
                      <p className="text-sm font-medium text-green-700">{c.final_answer}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {report.intervention_summary.length > 0 && (
              <>
                <h2 className="mt-4 text-sm font-semibold text-gray-700">
                  Interventions triggered
                </h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  {report.intervention_summary.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
