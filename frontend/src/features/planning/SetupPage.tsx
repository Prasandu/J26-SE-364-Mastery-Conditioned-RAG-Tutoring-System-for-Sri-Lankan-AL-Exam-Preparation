import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import { createPlan, type PlanInput } from "../../api/planning";
import ErrorState from "../../components/ErrorState";

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function futureDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function PlanningSetupPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<PlanInput["mode"]>("predicted");
  const [examDate, setExamDate] = useState(futureDate(90));
  const [targetGrade, setTargetGrade] = useState("A");
  const [topicIds, setTopicIds] = useState("");
  const [weekday, setWeekday] = useState(0);
  const [startTime, setStartTime] = useState("16:00");
  const [endTime, setEndTime] = useState("18:00");
  const [maxSession, setMaxSession] = useState(60);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const topics = topicIds
      .split(",")
      .map((topic) => topic.trim())
      .filter(Boolean);
    const data: PlanInput = {
      mode,
      exam_date: examDate,
      target_grade: targetGrade,
      topics,
      availability_windows: [
        { weekday, start_time: startTime, end_time: endTime },
      ],
      max_session_minutes: maxSession,
      max_daily_minutes: Math.max(maxSession, 180),
      timezone: "Asia/Colombo",
      preferred_times: [],
      fixed_commitments: [],
      priorities: [],
    };

    try {
      await createPlan(data);
      navigate("/planning/plan");
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Please check the planning service connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">
        Planning setup
      </p>
      <h2 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">
        Build a plan around your exam
      </h2>
      <p className="mt-2 text-slate-600">
        Set your target, choose when you can study, and let the planning service
        organize your next steps.
      </p>

      {error ? (
        <div className="mt-6">
          <ErrorState message={error} />
        </div>
      ) : null}

      <form
        className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7"
        onSubmit={submit}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Plan type
            <select
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              onChange={(event) =>
                setMode(event.target.value as PlanInput["mode"])
              }
              value={mode}
            >
              <option value="predicted">Adaptive (recommended)</option>
              <option value="manual">Choose my own topics</option>
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Adaptive plans use your saved mastery data. Choose a custom plan
              if you have not completed assessments yet.
            </span>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Target grade
            <select
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              onChange={(event) => setTargetGrade(event.target.value)}
              value={targetGrade}
            >
              {["A", "B", "C", "S", "F"].map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
            Exam date
            <input
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5"
              min={futureDate(1)}
              onChange={(event) => setExamDate(event.target.value)}
              required
              type="date"
              value={examDate}
            />
          </label>
          {mode === "manual" ? (
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Topic IDs (comma-separated)
              <input
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5"
                onChange={(event) => setTopicIds(event.target.value)}
                placeholder="e.g. CHEM.CALC.MOLE, CHEM.STRUCT.BOND"
                required
                value={topicIds}
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Use topic IDs from your course catalogue.
              </span>
            </label>
          ) : null}
        </div>

        <div className="border-t border-slate-100 pt-5">
          <h3 className="font-semibold text-ink">Your weekly availability</h3>
          <p className="mt-1 text-sm text-slate-600">
            Add one regular study window. You can adjust your plan later.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium text-slate-700">
              Day
              <select
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                onChange={(event) => setWeekday(Number(event.target.value))}
                value={weekday}
              >
                {weekdays.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              From
              <input
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5"
                onChange={(event) => setStartTime(event.target.value)}
                required
                type="time"
                value={startTime}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Until
              <input
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5"
                onChange={(event) => setEndTime(event.target.value)}
                required
                type="time"
                value={endTime}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Session length
              <select
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                onChange={(event) => setMaxSession(Number(event.target.value))}
                value={maxSession}
              >
                {[30, 45, 60, 90, 120, 150, 180].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <button
          className="w-full rounded-lg bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          disabled={saving}
          type="submit"
        >
          {saving ? "Saving plan..." : "Create my plan"}
        </button>
      </form>
    </section>
  );
}
