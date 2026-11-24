import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getDashboard, getInterventionHistory } from "../services/studentsApi";
import type { Dashboard, InterventionHistoryItem } from "../types/dashboard";

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "neutral" | "green" | "amber";
}) {
  const accentClass = {
    neutral: "text-slate-900",
    green: "text-green-700",
    amber: "text-amber-700",
  }[accent];

  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accentClass}`}>{value}</p>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const studentId = user!.id;

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [history, setHistory] = useState<InterventionHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadDashboard(id: string) {
    setLoading(true);
    setError(null);
    Promise.all([getDashboard(id), getInterventionHistory(id)])
      .then(([d, h]) => {
        setDashboard(d);
        setHistory(h);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load dashboard"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadDashboard(studentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const independentPercent = dashboard ? Math.round(dashboard.independent_rate * 100) : 0;

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4">
          <h1 className="text-lg font-semibold">Your Progress</h1>
        </div>

        {loading && <p className="text-slate-400">Loading...</p>}
        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">Could not load dashboard: {error}</p>
            <button
              onClick={() => loadDashboard(studentId)}
              className="mt-2 rounded bg-red-600 px-3 py-1.5 text-sm text-white"
            >
              Retry
            </button>
          </div>
        )}

        {dashboard && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Attempts" value={dashboard.total_attempts} accent="neutral" />
              <StatTile label="Correct" value={dashboard.total_correct} accent="neutral" />
              <StatTile label="Independent" value={dashboard.total_independent} accent="green" />
              <StatTile label="Assisted" value={dashboard.total_assisted} accent="amber" />
            </div>

            <div className="mt-4 rounded-lg border bg-white p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">Independent mastery rate</span>
                <span className="font-semibold text-green-700">{independentPercent}%</span>
              </div>
              <div className="mt-2 h-3 w-full rounded-full bg-slate-200">
                <div
                  className="h-3 rounded-full bg-green-600"
                  style={{ width: `${independentPercent}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Share of correct answers solved without hints (out of {dashboard.total_correct}{" "}
                correct answers)
              </p>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Question</th>
                    <th className="px-4 py-2">Attempts</th>
                    <th className="px-4 py-2">Correct</th>
                    <th className="px-4 py-2">Independent</th>
                    <th className="px-4 py-2">Assisted</th>
                    <th className="px-4 py-2">Hints Used</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.per_question.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                        No activity yet.
                      </td>
                    </tr>
                  )}
                  {dashboard.per_question.map((q) => (
                    <tr key={q.question_code} className="border-t">
                      <td className="px-4 py-2 font-medium">{q.question_code}</td>
                      <td className="px-4 py-2">{q.attempts}</td>
                      <td className="px-4 py-2">{q.correct_attempts}</td>
                      <td className="px-4 py-2 text-green-700">{q.independent_successes}</td>
                      <td className="px-4 py-2 text-amber-700">{q.assisted_successes}</td>
                      <td className="px-4 py-2">{q.hints_used_total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-lg border bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-700">Intervention History</h2>
              {history.length === 0 && (
                <p className="text-sm text-slate-400">No interventions triggered yet.</p>
              )}
              <ul className="space-y-2">
                {history.map((h, i) => (
                  <li key={i} className="border-t pt-2 text-sm text-slate-700 first:border-t-0 first:pt-0">
                    <p>{h.message}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(h.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
