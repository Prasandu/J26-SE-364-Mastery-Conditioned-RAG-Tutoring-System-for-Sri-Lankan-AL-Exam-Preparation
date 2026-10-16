import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import catalogue from "../../../../shared/contracts/topics.json";
import { ApiError } from "../../api/client";
import {
  createPlan,
  getPlans,
  replacePlan,
  type AvailabilityWindow,
  type PlanInput,
} from "../../api/planning";
import ErrorState from "../../components/ErrorState";
import TopicTree, { type TopicNode } from "./TopicTree";
import { validatePlanForm } from "./planValidation";

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

interface AvailabilityEntry {
  enabled: boolean;
  start: string;
  end: string;
}

function futureDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isTopicNode(value: unknown): value is TopicNode {
  if (!value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  return (
    typeof node.id === "string" &&
    typeof node.name === "string" &&
    (node.topics === undefined ||
      (Array.isArray(node.topics) && node.topics.every(isTopicNode)))
  );
}

function getTopicUnits(value: unknown): TopicNode[] {
  if (!value || typeof value !== "object") return [];
  const units = (value as Record<string, unknown>).units;
  return Array.isArray(units) && units.every(isTopicNode) ? units : [];
}

const topicUnits = getTopicUnits(catalogue);

export default function PlanningSetupPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<PlanInput["mode"]>("predicted");
  const [examDate, setExamDate] = useState(futureDate(90));
  const [targetGrade, setTargetGrade] = useState("A");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [maxSession, setMaxSession] = useState(60);
  const [availability, setAvailability] = useState<AvailabilityEntry[]>(
    weekdays.map((_, day) => ({
      enabled: day === 0 || day === 2 || day === 5,
      start: day === 5 ? "09:00" : "16:00",
      end: day === 5 ? "11:00" : "18:00",
    })),
  );
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const windows = useMemo(
    () =>
      availability.flatMap((entry, weekday): AvailabilityWindow[] =>
        entry.enabled
          ? [
              {
                weekday,
                start_time: entry.start,
                end_time: entry.end,
              },
            ]
          : [],
      ),
    [availability],
  );

  function updateAvailability(
    weekday: number,
    change: Partial<AvailabilityEntry>,
  ) {
    setAvailability((current) =>
      current.map((entry, index) =>
        index === weekday ? { ...entry, ...change } : entry,
      ),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const errors = validatePlanForm({
      mode,
      examDate,
      targetGrade,
      topics: selectedTopics,
      availability: windows,
      maxSessionMinutes: maxSession,
    });
    setValidationErrors(errors);
    if (errors.length > 0) return;

    setSaving(true);
    const data: PlanInput = {
      mode,
      exam_date: examDate,
      target_grade: targetGrade,
      topics: mode === "manual" ? selectedTopics : [],
      availability_windows: windows,
      max_session_minutes: maxSession,
      max_daily_minutes: 180,
      timezone: "Asia/Colombo",
      preferred_times: [],
      fixed_commitments: [],
      priorities: [],
    };

    try {
      const { plans } = await getPlans();
      const latestPlan = plans[0];
      if (latestPlan) {
        const confirmed = window.confirm(
          "You already have a study plan. Replace your latest plan with these settings?",
        );
        if (!confirmed) return;
        await replacePlan(latestPlan.id, data);
      } else {
        await createPlan(data);
      }
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
    <section className="mx-auto max-w-4xl">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">
        Planning setup
      </p>
      <h2 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">
        Build a plan around your exam
      </h2>
      <p className="mt-2 text-slate-600">
        Choose your target and regular study windows. Adaptive plans use your
        saved mastery data to prioritize topics.
      </p>

      {error ? (
        <div className="mt-6">
          <ErrorState message={error} />
        </div>
      ) : null}

      <form
        className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7"
        noValidate
        onSubmit={submit}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">
              Planning mode
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              {(
                [
                  ["predicted", "Adaptive"],
                  ["manual", "Manual"],
                ] as const
              ).map(([value, label]) => (
                <button
                  aria-pressed={mode === value}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    mode === value
                      ? "bg-white text-brand shadow-sm"
                      : "text-slate-600 hover:text-ink"
                  }`}
                  key={value}
                  onClick={() => setMode(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
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
        </div>

        {mode === "manual" ? (
          <fieldset className="border-t border-slate-100 pt-5">
            <legend className="font-semibold text-ink">Choose topics</legend>
            <p className="mb-3 mt-1 text-sm text-slate-600">
              Expand a unit and select individual topics or an entire section.
            </p>
            {topicUnits.length > 0 ? (
              <TopicTree
                onChange={setSelectedTopics}
                selectedIds={selectedTopics}
                topics={topicUnits}
              />
            ) : (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                The shared topic catalogue could not be loaded.
              </p>
            )}
            <p className="mt-3 text-sm text-slate-600">
              {selectedTopics.length} topic IDs selected
            </p>
          </fieldset>
        ) : (
          <p className="rounded-xl bg-sky-50 p-4 text-sm text-sky-900">
            Adaptive planning requires at least one saved assessment or mastery
            record. The service selects topics using your current learning
            profile.
          </p>
        )}

        <fieldset className="border-t border-slate-100 pt-5">
          <legend className="font-semibold text-ink">
            Weekly availability
          </legend>
          <p className="mt-1 text-sm text-slate-600">
            Add the days and times you are usually free to study.
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <div className="hidden grid-cols-[minmax(8rem,1fr)_minmax(7rem,1fr)_minmax(7rem,1fr)] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
              <span>Day</span>
              <span>Start</span>
              <span>End</span>
            </div>
            <div className="divide-y divide-slate-100">
              {weekdays.map((day, index) => {
                const entry = availability[index];
                return (
                  <div
                    className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(8rem,1fr)_minmax(7rem,1fr)_minmax(7rem,1fr)] sm:items-center"
                    key={day}
                  >
                    <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
                      <input
                        checked={entry.enabled}
                        className="size-4 accent-brand"
                        onChange={(event) =>
                          updateAvailability(index, {
                            enabled: event.target.checked,
                          })
                        }
                        type="checkbox"
                      />
                      {day}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="w-10 sm:sr-only">Start</span>
                      <input
                        aria-label={`${day} start time`}
                        className="w-full rounded-lg border border-slate-300 px-2 py-2 disabled:bg-slate-100 disabled:text-slate-400"
                        disabled={!entry.enabled}
                        onChange={(event) =>
                          updateAvailability(index, { start: event.target.value })
                        }
                        type="time"
                        value={entry.start}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="w-10 sm:sr-only">End</span>
                      <input
                        aria-label={`${day} end time`}
                        className="w-full rounded-lg border border-slate-300 px-2 py-2 disabled:bg-slate-100 disabled:text-slate-400"
                        disabled={!entry.enabled}
                        onChange={(event) =>
                          updateAvailability(index, { end: event.target.value })
                        }
                        type="time"
                        value={entry.end}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        </fieldset>

        <label className="block max-w-sm text-sm font-medium text-slate-700">
          Maximum session length
          <select
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
            onChange={(event) => setMaxSession(Number(event.target.value))}
            value={maxSession}
          >
            {[15, 30, 45, 60, 90, 120, 150, 180].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutes
              </option>
            ))}
          </select>
        </label>

        {validationErrors.length > 0 ? (
          <div
            aria-live="assertive"
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
            role="alert"
          >
            <p className="font-semibold">Please fix the following:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
              {validationErrors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <button
          className="w-full rounded-lg bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          disabled={saving}
          type="submit"
        >
          {saving ? "Saving plan..." : "Save my plan"}
        </button>
      </form>
    </section>
  );
}
