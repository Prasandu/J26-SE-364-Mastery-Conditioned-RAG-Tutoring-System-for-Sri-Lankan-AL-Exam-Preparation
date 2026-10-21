import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import catalogue from "../../../../shared/contracts/topics.json";
import { ApiError } from "../../api/client";
import {
  createPlan,
  getPlanReadiness,
  getPlans,
  replacePlan,
  type AvailabilityWindow,
  type PlanInput,
  type PlanResponse,
} from "../../api/planning";
import ConfirmDialog from "../../components/ConfirmDialog";
import ErrorState from "../../components/ErrorState";
import PageHeader from "./PageHeader";
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

interface TimeSlot {
  start: string;
  end: string;
}

interface AvailabilityEntry {
  enabled: boolean;
  slots: TimeSlot[];
}

const MAX_SLOTS_PER_DAY = 4;
const DAILY_LIMIT_OPTIONS = [30, 60, 90, 120, 150, 180, 240, 300, 360, 480];

function formatDailyLimit(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} minutes`;
  const hourText = `${hours} hour${hours === 1 ? "" : "s"}`;
  return rest ? `${hourText} ${rest} minutes` : hourText;
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

function defaultAvailability(): AvailabilityEntry[] {
  return weekdays.map((_, day) => ({
    enabled: day === 0 || day === 2 || day === 5,
    slots: [
      {
        start: day === 5 ? "09:00" : "16:00",
        end: day === 5 ? "11:00" : "18:00",
      },
    ],
  }));
}

/** Rebuild the weekly form rows from a saved plan's availability windows. */
function availabilityFromWindows(windows: unknown): AvailabilityEntry[] | null {
  if (!Array.isArray(windows) || windows.length === 0) return null;
  const byDay = new Map<number, TimeSlot[]>();
  for (const item of windows) {
    if (!item || typeof item !== "object") continue;
    const { weekday, start_time: start, end_time: end } = item as Record<string, unknown>;
    if (typeof weekday !== "number" || typeof start !== "string" || typeof end !== "string") continue;
    const slots = byDay.get(weekday) ?? [];
    slots.push({ start: start.slice(0, 5), end: end.slice(0, 5) });
    byDay.set(weekday, slots);
  }
  if (byDay.size === 0) return null;
  return weekdays.map((_, day) => {
    const slots = (byDay.get(day) ?? []).sort((left, right) => left.start.localeCompare(right.start));
    return slots.length
      ? { enabled: true, slots }
      : { enabled: false, slots: [{ start: "16:00", end: "18:00" }] };
  });
}

export default function PlanningSetupPage() {
  const navigate = useNavigate();
  const [chosenMode, setMode] = useState<PlanInput["mode"]>("predicted");
  // null = still checking (or the check failed; the server still enforces the rule)
  const [adaptiveBlockedReason, setAdaptiveBlockedReason] = useState<string | null>(null);
  // Adaptive plans are built from results, so a student with none must use Manual.
  const mode: PlanInput["mode"] = adaptiveBlockedReason ? "manual" : chosenMode;
  const [examDate, setExamDate] = useState(futureDate(90));
  const [targetGrade, setTargetGrade] = useState("A");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [maxSession, setMaxSession] = useState(60);
  const [maxDaily, setMaxDaily] = useState(180);
  const [availability, setAvailability] = useState<AvailabilityEntry[]>(defaultAvailability);
  // undefined = still loading; null = no existing plan
  const [existingPlan, setExistingPlan] = useState<PlanResponse | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // Set when the student already has a plan and must confirm replacing it.
  const [pendingReplacement, setPendingReplacement] = useState<{
    planId: string;
    data: PlanInput;
  } | null>(null);

  const windows = useMemo(
    () =>
      availability.flatMap((entry, weekday): AvailabilityWindow[] =>
        entry.enabled
          ? entry.slots.map((slot) => ({
              weekday,
              start_time: slot.start,
              end_time: slot.end,
            }))
          : [],
      ),
    [availability],
  );

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => getPlanReadiness())
      .then((readiness) => {
        if (active && readiness && !readiness.adaptive_available) {
          setAdaptiveBlockedReason(readiness.adaptive_unavailable_reason ?? "Adaptive plans need your results first.");
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => getPlans())
      .then((response) => {
        if (!active) return;
        const latest = response?.plans?.[0] ?? null;
        setExistingPlan(latest);
        if (latest) applyPlan(latest);
      })
      .catch(() => {
        if (active) setExistingPlan(undefined);
      });
    return () => {
      active = false;
    };
  }, []);

  function applyPlan(plan: PlanResponse) {
    const constraints = plan.constraints ?? {};
    setMode(plan.mode);
    setExamDate(plan.exam_date);
    setTargetGrade(plan.target_grade);
    const topics = constraints.topics;
    if (Array.isArray(topics) && topics.every((item) => typeof item === "string")) {
      setSelectedTopics(topics);
    }
    if (typeof constraints.max_session_minutes === "number") setMaxSession(constraints.max_session_minutes);
    if (typeof constraints.max_daily_minutes === "number") setMaxDaily(constraints.max_daily_minutes);
    const saved = availabilityFromWindows(constraints.availability_windows);
    if (saved) setAvailability(saved);
  }

  function updateDay(weekday: number, change: (entry: AvailabilityEntry) => AvailabilityEntry) {
    setAvailability((current) =>
      current.map((entry, index) => (index === weekday ? change(entry) : entry)),
    );
  }

  function updateSlot(weekday: number, slotIndex: number, change: Partial<TimeSlot>) {
    updateDay(weekday, (entry) => ({
      ...entry,
      slots: entry.slots.map((slot, index) => (index === slotIndex ? { ...slot, ...change } : slot)),
    }));
  }

  function addSlot(weekday: number) {
    updateDay(weekday, (entry) => {
      const last = entry.slots[entry.slots.length - 1];
      // Suggest the evening after an earlier slot, e.g. a morning + evening study day.
      const start = last && last.end < "19:00" ? "19:00" : "06:00";
      const end = start === "19:00" ? "21:00" : "07:30";
      return { ...entry, enabled: true, slots: [...entry.slots, { start, end }] };
    });
  }

  function removeSlot(weekday: number, slotIndex: number) {
    updateDay(weekday, (entry) => ({
      ...entry,
      slots: entry.slots.filter((_, index) => index !== slotIndex),
    }));
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
      maxDailyMinutes: maxDaily,
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
      max_daily_minutes: maxDaily,
      timezone: "Asia/Colombo",
      preferred_times: [],
      fixed_commitments: [],
      priorities: [],
    };

    try {
      // Reuse the plan loaded for prefilling; ask again only if that load failed.
      const latestPlan =
        existingPlan !== undefined ? existingPlan : ((await getPlans())?.plans?.[0] ?? null);
      if (latestPlan) {
        setPendingReplacement({ planId: latestPlan.id, data });
        return;
      }
      await createPlan(data);
      navigate("/planning/plan");
    } catch (cause) {
      showSaveError(cause);
    } finally {
      setSaving(false);
    }
  }

  function showSaveError(cause: unknown) {
    setError(
      cause instanceof ApiError
        ? cause.message
        : "Please check the planning service connection and try again.",
    );
  }

  async function confirmReplacement() {
    if (!pendingReplacement) return;
    const { planId, data } = pendingReplacement;
    setPendingReplacement(null);
    setSaving(true);
    try {
      await replacePlan(planId, data);
      navigate("/planning/plan");
    } catch (cause) {
      showSaveError(cause);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-4xl">
      <PageHeader
        description="Choose your target and regular study windows. Adaptive plans use your saved mastery data to prioritize topics."
        eyebrow="Planning setup"
        title="Build a plan around your exam"
      >
        {existingPlan ? (
          <p className="mt-4 rounded-2xl bg-brand-soft p-3 text-sm text-brand" role="status">
            These are your current plan's settings. Change what you need and save
            to update your plan.
          </p>
        ) : null}
      </PageHeader>

      {error ? (
        <div className="mt-6">
          <ErrorState message={error} />
        </div>
      ) : null}

      <form
        className="mt-6 space-y-6 rounded-3xl border border-slate-100 bg-white shadow-card p-4 sm:p-7"
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
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                  disabled={value === "predicted" && adaptiveBlockedReason !== null}
                  key={value}
                  onClick={() => setMode(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            {adaptiveBlockedReason ? (
              <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950" role="status">
                <span className="font-semibold">Adaptive isn't available yet.</span>{" "}
                {adaptiveBlockedReason}
              </p>
            ) : null}
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
            Adaptive planning picks your topics from your assessment results and
            keeps adapting as you answer more questions.
          </p>
        )}

        <fieldset className="border-t border-slate-100 pt-5">
          <legend className="font-semibold text-ink">
            Weekly availability
          </legend>
          <p className="mt-1 text-sm text-slate-600">
            Add the days and times you are usually free to study. Use
            "+ Add time" for a second slot on the same day, such as morning and
            evening.
          </p>
          <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {weekdays.map((day, index) => {
              const entry = availability[index];
              return (
                <div className="grid gap-3 px-4 py-3 sm:grid-cols-[8rem_1fr] sm:items-start" key={day}>
                  <label className="flex items-center gap-3 pt-2 text-sm font-medium text-slate-800">
                    <input
                      checked={entry.enabled}
                      className="size-4 accent-brand"
                      onChange={(event) =>
                        updateDay(index, (current) => ({
                          ...current,
                          enabled: event.target.checked,
                          slots: current.slots.length ? current.slots : [{ start: "16:00", end: "18:00" }],
                        }))
                      }
                      type="checkbox"
                    />
                    {day}
                  </label>
                  <div className="grid gap-2">
                    {entry.slots.map((slot, slotIndex) => {
                      const suffix = slotIndex === 0 ? "" : ` ${slotIndex + 1}`;
                      return (
                        <div className="flex flex-wrap items-center gap-2" key={slotIndex}>
                          <input
                            aria-label={`${day} start time${suffix}`}
                            className="w-32 rounded-lg border border-slate-300 px-2 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                            disabled={!entry.enabled}
                            onChange={(event) => updateSlot(index, slotIndex, { start: event.target.value })}
                            type="time"
                            value={slot.start}
                          />
                          <span className="text-sm text-slate-500">to</span>
                          <input
                            aria-label={`${day} end time${suffix}`}
                            className="w-32 rounded-lg border border-slate-300 px-2 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                            disabled={!entry.enabled}
                            onChange={(event) => updateSlot(index, slotIndex, { end: event.target.value })}
                            type="time"
                            value={slot.end}
                          />
                          {entry.enabled && entry.slots.length > 1 ? (
                            <button
                              aria-label={`Remove ${day} time${suffix || " 1"}`}
                              className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-ink"
                              onClick={() => removeSlot(index, slotIndex)}
                              type="button"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                    {entry.enabled && entry.slots.length < MAX_SLOTS_PER_DAY ? (
                      <button
                        aria-label={`Add another ${day} time`}
                        className="w-fit rounded-lg px-2 py-1 text-sm font-medium text-brand hover:bg-slate-100"
                        onClick={() => addSlot(index)}
                        type="button"
                      >
                        + Add time
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
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
          <label className="block text-sm font-medium text-slate-700">
            Maximum study per day
            <select
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              onChange={(event) => setMaxDaily(Number(event.target.value))}
              value={maxDaily}
            >
              {DAILY_LIMIT_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {formatDailyLimit(minutes)}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-500">
              The plan never schedules more than this on one day.
            </span>
          </label>
        </div>

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
          className="w-full rounded-full bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          disabled={saving}
          type="submit"
        >
          {saving ? "Saving plan..." : "Save my plan"}
        </button>
      </form>

      {pendingReplacement ? (
        <ConfirmDialog
          cancelLabel="Keep my current plan"
          confirmLabel="Replace my plan"
          id="replace-plan-title"
          onCancel={() => setPendingReplacement(null)}
          onConfirm={() => void confirmReplacement()}
          title="Replace your current plan?"
        >
          <p>
            Saving will update your latest study plan with these settings. Your
            marks and finished sessions stay.
          </p>
          <p>Upcoming sessions are refreshed the next time you generate your plan.</p>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
