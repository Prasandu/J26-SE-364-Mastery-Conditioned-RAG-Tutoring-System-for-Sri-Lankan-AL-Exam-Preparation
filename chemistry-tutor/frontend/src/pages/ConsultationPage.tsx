import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getConsultation } from "../services/studentsApi";
import type { Consultation } from "../types/consultation";

export function ConsultationPage() {
  const { user } = useAuth();
  const studentId = user!.id;

  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadConsultation(id: string) {
    setLoading(true);
    setError(null);
    getConsultation(id)
      .then(setConsultation)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load consultation"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadConsultation(studentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-blue-950">How are you doing?</h1>
          <p className="text-sm text-slate-500">A quick check-in based on your recent practice.</p>
        </div>

        {loading && <p className="text-slate-400">Thinking about how to best support you...</p>}
        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">Could not load consultation: {error}</p>
            <button
              onClick={() => loadConsultation(studentId)}
              className="mt-2 rounded bg-red-600 px-3 py-1.5 text-sm text-white"
            >
              Retry
            </button>
          </div>
        )}

        {consultation && (
          <>
            {!consultation.has_data && (
              <div className="rounded border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                {consultation.revision_plan}
              </div>
            )}

            {consultation.has_data && (
              <>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-blue-950">
                    {consultation.revision_plan}
                  </p>
                </div>

                <details className="mt-4 rounded-lg border bg-white p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                    What's behind this (questions you've been finding tricky)
                  </summary>
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {consultation.weak_topics.map((wt) => (
                      <li key={wt.question_code}>
                        <span className="font-medium">{wt.question_code}</span> (Unit {wt.unit}) —{" "}
                        {wt.reason}
                        {wt.prerequisite_names.length > 0 && (
                          <span className="text-amber-700">
                            {" "}
                            (builds on: {wt.prerequisite_names.join(", ")})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}

            <div className="mt-4 rounded-lg border bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-700">A few general wellbeing tips</h2>
              <p className="mb-2 text-xs text-slate-400">
                General advice, not personalized — this app doesn't detect your actual emotional
                state.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {consultation.wellness_tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
