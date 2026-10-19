import { useEffect, useState } from "react";
import { getConsultation } from "../services/studentsApi";
import type { Consultation } from "../types/consultation";

export function ConsultationPage() {
  const [studentId, setStudentId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");

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
    if (studentId) loadConsultation(studentId);
  }, [studentId]);

  if (!studentId) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="w-80 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-2 text-lg font-semibold">Get a study consultation</h2>
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
            Get Consultation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Study Consultation: {studentId}</h1>
          <button onClick={() => setStudentId(null)} className="text-sm text-blue-600 underline">
            Switch student
          </button>
        </div>

        {loading && <p className="text-gray-400">Generating your consultation...</p>}
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
                <div className="rounded-lg border bg-white p-4">
                  <h2 className="mb-2 text-sm font-semibold text-gray-700">Revision Plan</h2>
                  <p className="whitespace-pre-wrap text-sm text-gray-800">
                    {consultation.revision_plan}
                  </p>
                </div>

                <div className="mt-4 rounded-lg border bg-white p-4">
                  <h2 className="mb-2 text-sm font-semibold text-gray-700">Topics to focus on</h2>
                  <ul className="space-y-1 text-sm text-gray-700">
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
                </div>
              </>
            )}

            <div className="mt-4 rounded-lg border bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold text-gray-700">General study tips</h2>
              <p className="mb-2 text-xs text-gray-400">
                Generic advice, not personalized to your emotional state.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
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
