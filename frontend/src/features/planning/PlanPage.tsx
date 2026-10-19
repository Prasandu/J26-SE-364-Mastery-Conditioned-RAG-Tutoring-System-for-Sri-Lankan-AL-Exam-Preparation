import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { ApiError } from "../../api/client";
import {
  chooseTarget,
  generateSchedule,
  getPlans,
  getRoadmap,
  getSchedule,
  runCheckpoint,
  updateTaskStatus,
  type PlanResponse,
  type RoadmapResponse,
  type RollingUpdateResponse,
  type ScheduleResponse,
  type ScheduledTask,
  type TargetChoiceOption,
  type TaskStatus,
  type TaskReason,
} from "../../api/planning";
import ErrorState from "../../components/ErrorState";
import LoadingState from "../../components/LoadingState";
import CoachingCard from "./CoachingCard";
import RoadmapSection, { CheckpointNotice } from "./RoadmapSection";

type ViewMode = "list" | "calendar";

const statusStyles: Record<string, string> = {
  planned: "border-sky-200 bg-sky-50 text-sky-950",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-950",
  partial: "border-amber-200 bg-amber-50 text-amber-950",
  missed: "border-rose-200 bg-rose-50 text-rose-950",
};

export function formatTopicName(task: {
  topic_id: string;
  reason_details?: { topic?: string; sub_topic?: string | null } | null;
}): string {
  if (task.reason_details?.topic) {
    return task.reason_details.sub_topic
      ? `${task.reason_details.topic}, ${task.reason_details.sub_topic}`
      : task.reason_details.topic;
  }
  let clean = task.topic_id.replace(/^[a-z]+-u\d+-?/i, "");
  if (!clean || clean === task.topic_id) {
    clean = task.topic_id.replace(/^[a-z]+-/i, "");
  }
  const words = clean.split(/[-_]/).filter(Boolean);
  if (words.length > 0) {
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
  return task.topic_id;
}

const activityLabels: Record<string, string> = {
  theory: "Learn the theory",
  guided_practice: "Guided practice",
  structured_questions: "Structured questions",
  past_paper: "Past-paper practice",
  error_review: "Review mistakes",
  spaced_revision: "Quick revision",
  recovery_revision: "Recovery revision",
};

export function formatActivity(activity: string): string {
  if (activityLabels[activity]) return activityLabels[activity];
  const words = activity.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function movedTasks(before: ScheduledTask[], after: ScheduledTask[]): string[] {
  const oldSlots = new Set(
    before.map((task) => `${task.topic_id}|${task.start_at}|${task.duration_min}`),
  );
  return after
    .filter(
      (task) =>
        task.replanned_from !== null ||
        !oldSlots.has(
          `${task.topic_id}|${task.start_at}|${task.duration_min}`,
        ),
    )
    .map(
      (task) =>
        `${formatActivity(task.activity)} · ${formatTopicName(task)} — ${new Date(task.start_at).toLocaleString()}`,
    );
}

function taskDate(task: ScheduledTask): string {
  return new Date(task.start_at).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function taskTime(task: ScheduledTask): string {
  return new Date(task.start_at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function masteryLabel(mastery: number): string {
  if (mastery < 0.45) return "weak";
  if (mastery < 0.75) return "developing";
  return "strong";
}

export function trendLabel(trend: number): string {
  if (trend < -0.01) return `declining (${Math.round(Math.abs(trend) * 100)}%)`;
  if (trend > 0.01) return `improving (${Math.round(trend * 100)}%)`;
  return "stable";
}

export function weightLabel(weight: number): string {
  if (weight >= 0.67) return "high";
  if (weight >= 0.34) return "moderate";
  return "low";
}

export function getWhyNowText(reasonDetails: TaskReason): string {
  const focusTopic = reasonDetails.sub_topic ?? reasonDetails.topic;
  const weight = weightLabel(reasonDetails.exam_weight);

  if (reasonDetails.decline_alert?.message) {
    return reasonDetails.decline_alert.message;
  }
  if (reasonDetails.has_evidence === false) {
    return `You haven't tried questions in ${focusTopic} yet, and it carries ${weight} weight in the exam.`;
  }
  const trend = trendLabel(reasonDetails.trend);
  const article = trend.startsWith("improving") ? "an" : "a";
  return `Your mastery in ${focusTopic} is ${Math.round(reasonDetails.mastery * 100)}% (${masteryLabel(reasonDetails.mastery)}) with ${article} ${trend} trend, and it carries ${weight} weight in the exam.`;
}

export function formatStepKind(kind: string): string {
  if (kind === "practice") return "practice questions";
  if (kind === "theory") return "theory";
  if (kind === "review") return "review";
  return kind.replace(/_/g, " ");
}

export function formatStepsSummary(
  steps: Array<{ kind: string; minutes: number }>,
): string {
  return steps.map((s) => `${s.minutes} min ${formatStepKind(s.kind)}`).join(", ");
}

function TaskCard({
  task,
  busy,
  partialMinutes,
  onPartialMinutesChange,
  onStatus,
}: {
  task: ScheduledTask;
  busy: boolean;
  partialMinutes: number;
  onPartialMinutesChange: (minutes: number) => void;
  onStatus: (task: ScheduledTask, status: TaskStatus) => void;
}) {
  const [showReason, setShowReason] = useState(false);
  const style =
    statusStyles[task.status] ?? "border-slate-200 bg-white text-ink";
  const actionable = task.status === "planned" && task.id !== null;
  const validPartialMinutes =
    Number.isInteger(partialMinutes) &&
    partialMinutes >= 1 &&
    partialMinutes <= task.duration_min;
  const displayTopic = formatTopicName(task);

  return (
    <article
      className={`rounded-xl border p-4 shadow-sm ${style}`}
      data-status={task.status}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">
            {formatActivity(task.activity)} · {displayTopic}
          </p>
          <p className="mt-1 text-sm opacity-80">
            {taskDate(task)} at {taskTime(task)} · {task.duration_min} min ·{" "}
            <span className="capitalize">{task.status}</span>
          </p>
        </div>
        <button
          className="shrink-0 rounded-lg border border-current/20 px-3 py-1.5 text-sm font-medium hover:bg-white/60"
          onClick={() => setShowReason(true)}
          type="button"
        >
          Why this task?
        </button>
      </div>

      {showReason ? (
        <div
          aria-labelledby={`task-reason-title-${task.id ?? task.topic_id}`}
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
        >
          <section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 text-ink shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h3
                className="text-xl font-bold"
                id={`task-reason-title-${task.id ?? task.topic_id}`}
              >
                Why this task?
              </h3>
              <button
                aria-label="Close task explanation"
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                onClick={() => setShowReason(false)}
                type="button"
              >
                Close
              </button>
            </div>
            {task.reason_details ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm">
                  <span className="font-semibold text-slate-900">Topic:</span>{" "}
                  <span className="text-slate-700">
                    {task.reason_details.topic}
                    {task.reason_details.sub_topic
                      ? `, ${task.reason_details.sub_topic}`
                      : ""}
                  </span>
                </p>
                <p className="text-sm">
                  <span className="font-semibold text-slate-900">Why now:</span>{" "}
                  <span className="text-slate-700">
                    {getWhyNowText(task.reason_details)}
                  </span>
                </p>
                {task.reason_details.final_week ? (
                  <p className="rounded-lg bg-violet-50 p-2 text-sm text-violet-950">
                    Final week: revision and past papers only, with no new
                    theory.
                  </p>
                ) : null}
                <p className="text-sm">
                  <span className="font-semibold text-slate-900">
                    Days left to your exam:
                  </span>{" "}
                  <span className="text-slate-700">
                    {task.reason_details.days_to_exam}{" "}
                    {task.reason_details.days_to_exam === 1 ? "day" : "days"}
                  </span>
                </p>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    What to do in this slot
                  </p>
                  {task.steps && task.steps.length > 0 ? (
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {formatStepsSummary(task.steps)}
                    </p>
                  ) : null}
                  {task.reason_details.activity_recommendation ? (
                    <p className="mt-1 text-sm text-slate-600">
                      {task.reason_details.activity_recommendation}
                    </p>
                  ) : null}
                  <ol className="mt-2 list-inside list-decimal space-y-2 text-sm text-slate-700">
                    {(task.steps ?? []).map((step, index) => (
                      <li key={`${step.kind}-${index}`}>
                        <span className="capitalize">{step.kind}</span> (
                        {step.minutes} min)
                        {step.question_ids.length ? (
                          <span className="block break-words pl-6 text-slate-600">
                            Questions: {step.question_ids.join(", ")}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
                {task.reason_details.main_factors &&
                Object.keys(task.reason_details.main_factors).length > 0 ? (
                  <div className="pt-1">
                    <p className="text-sm font-semibold text-slate-900">
                      Priority factors
                    </p>
                    <ul className="mt-1 list-inside list-disc text-sm text-slate-700">
                      {Object.entries(task.reason_details.main_factors).map(
                        ([name, value]) => (
                          <li key={name}>
                            {name.replaceAll("_", " ")}:{" "}
                            {Math.round(value * 100)}%
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-sm">
                  <span className="font-semibold text-slate-900">Topic:</span>{" "}
                  <span className="text-slate-700">{displayTopic}</span>
                </p>
                <p className="text-sm">
                  <span className="font-semibold text-slate-900">Why now:</span>{" "}
                  <span className="text-slate-700">{task.reason}</span>
                </p>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {actionable ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-current/10 pt-3 sm:flex-row sm:items-center">
          <button
            className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            disabled={busy}
            onClick={() => onStatus(task, "completed")}
            type="button"
          >
            Done
          </button>
          <label className="flex items-center gap-2 text-xs font-medium">
            Actual min
            <input
              aria-label={`Actual minutes for ${displayTopic}`}
              className="w-20 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-ink"
              max={task.duration_min}
              min={1}
              onChange={(event) =>
                onPartialMinutesChange(Number(event.target.value))
              }
              type="number"
              value={partialMinutes}
            />
          </label>
          <button
            className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            disabled={busy || !validPartialMinutes}
            onClick={() => onStatus(task, "partial")}
            type="button"
          >
            Partial
          </button>
          <button
            className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
            disabled={busy}
            onClick={() => onStatus(task, "missed")}
            type="button"
          >
            Missed
          </button>
        </div>
      ) : null}
    </article>
  );
}

export default function PlanningPage() {
  const { session, loading: authLoading } = useAuth();
  const studentId = session?.user.id;
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [partialMinutes, setPartialMinutes] = useState<Record<string, number>>(
    {},
  );
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string[]>([]);
  const [roadmap, setRoadmap] = useState<RoadmapResponse | null>(null);
  const [rollingUpdate, setRollingUpdate] =
    useState<RollingUpdateResponse | null>(null);
  const [choosingTarget, setChoosingTarget] = useState(false);

  useEffect(() => {
    let active = true;
    if (authLoading) {
      setLoading(true);
      return () => {
        active = false;
      };
    }
    if (!studentId) {
      setPlans([]);
      setSelectedPlanId("");
      setSchedule(null);
      setError("Sign in to load your study plans.");
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError("");
    setPlans([]);
    setSelectedPlanId("");
    setSchedule(null);
    void getPlans()
      .then((response) => {
        if (active) {
          setPlans(response.plans);
          setSelectedPlanId(response.plans[0]?.id ?? "");
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof ApiError
              ? cause.message
              : "Please check the planning service connection and try again.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authLoading, reloadKey, studentId]);

  const currentPlan =
    plans.find((plan) => plan.id === selectedPlanId) ?? plans[0];
  const currentPlanId = currentPlan?.id;

  useEffect(() => {
    let active = true;
    if (authLoading || loading || !currentPlanId) {
      setSchedule(null);
      setScheduleLoading(false);
      return () => {
        active = false;
      };
    }

    setSchedule(null);
    setRoadmap(null);
    setRollingUpdate(null);
    setScheduleLoading(true);
    setError("");
    // Roadmap first: if a checkpoint is due, rebuild the window before
    // loading sessions so the schedule shown is the fresh one.
    void loadRoadmap(currentPlanId)
      .then(({ roadmap: nextRoadmap, update }) => {
        if (!active) return;
        setRoadmap(nextRoadmap);
        setRollingUpdate(update);
      })
      .then(() => getSchedule(currentPlanId))
      .then((response) => {
        if (active) setSchedule(response);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof ApiError
              ? cause.message
              : "Saved study sessions could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setScheduleLoading(false);
      });
    return () => {
      active = false;
    };
    // Keyed on the plan ID so local edits (e.g. a new target grade) don't reload.
  }, [authLoading, currentPlanId, loading]);

  async function chooseNextStep(plan: PlanResponse, choice: TargetChoiceOption) {
    setChoosingTarget(true);
    setError("");
    try {
      const result = await chooseTarget(plan.id, choice);
      setRoadmap(result.roadmap);
      setRollingUpdate(result);
      setPlans((current) =>
        current.map((item) =>
          item.id === plan.id
            ? { ...item, target_grade: result.target_grade }
            : item,
        ),
      );
      setSchedule(await getSchedule(plan.id));
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Your choice could not be saved.",
      );
    } finally {
      setChoosingTarget(false);
    }
  }

  async function regenerate(plan: PlanResponse) {
    setGenerating(true);
    setError("");
    setToast([]);
    const previousTasks = schedule?.tasks ?? [];
    try {
      const nextSchedule = await generateSchedule(plan.id);
      setSchedule(nextSchedule);
      void getRoadmap(plan.id)
        .then((nextRoadmap) => setRoadmap(nextRoadmap ?? null))
        .catch(() => undefined);
      const changed = movedTasks(previousTasks, nextSchedule.tasks);
      setToast(
        changed.length > 0
          ? changed
          : ["The schedule was regenerated; no existing sessions moved."],
      );
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "The study schedule could not be generated.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function updateStatus(task: ScheduledTask, status: TaskStatus) {
    if (!task.id) return;
    setBusyTaskId(task.id);
    setError("");
    setToast([]);
    const before = schedule?.tasks ?? [];
    try {
      const result = await updateTaskStatus(task.id, {
        status,
        ...(status === "partial"
          ? {
              actual_duration_min:
                partialMinutes[task.id] ?? Math.max(1, Math.floor(task.duration_min / 2)),
            }
          : {}),
      });
      if (result.schedule) {
        setSchedule(result.schedule);
        const changed = movedTasks(before, result.schedule.tasks);
        setToast(
          result.replanned
            ? changed.length > 0
              ? changed
              : ["Remaining study time was replanned; no additional sessions moved."]
            : [],
        );
      } else if (schedule) {
        setSchedule({
          ...schedule,
          tasks: schedule.tasks.map((item) =>
            item.id === result.task.id ? result.task : item,
          ),
        });
      }
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : `Could not mark this task ${status}.`,
      );
    } finally {
      setBusyTaskId(null);
    }
  }

  if (authLoading || loading) {
    return <LoadingState label="Loading your study plans..." />;
  }
  if (error && plans.length === 0) {
    return (
      <ErrorState
        message={error}
        onRetry={() => setReloadKey((current) => current + 1)}
      />
    );
  }

  const tasks = schedule?.tasks ?? [];
  const groupedTasks = tasks.reduce<Record<string, ScheduledTask[]>>(
    (groups, task) => {
      const key = new Date(task.start_at).toLocaleDateString();
      (groups[key] ??= []).push(task);
      return groups;
    },
    {},
  );

  return (
    <section>
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">
        Your plan
      </p>
      <h2 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">
        Your study sessions
      </h2>
      {!currentPlan ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-slate-600">
            You have not set up a study plan yet.
          </p>
          <Link
            className="mt-4 inline-flex rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark"
            to="/planning/setup"
          >
            Set up a plan
          </Link>
        </div>
      ) : (
        <>
          {plans.length > 1 ? (
            <label className="mt-5 block max-w-lg text-sm font-medium text-slate-700">
              Select a saved plan
              <select
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                onChange={(event) => {
                  setSelectedPlanId(event.target.value);
                  setSchedule(null);
                  setScheduleLoading(true);
                  setToast([]);
                  setError("");
                }}
                value={currentPlan.id}
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.exam_date} · Target {plan.target_grade} ·{" "}
                    {plan.mode === "predicted" ? "Adaptive" : "Custom"} ·{" "}
                    {plan.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-ink">
                {currentPlan.mode === "predicted"
                  ? "Adaptive study plan"
                  : "Custom study plan"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Exam date: {currentPlan.exam_date} · Target grade:{" "}
                {currentPlan.target_grade}
              </p>
            </div>
            <button
              className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              disabled={generating || scheduleLoading || (error !== "" && schedule === null)}
              onClick={() => void regenerate(currentPlan)}
              type="button"
            >
              {generating
                ? "Regenerating..."
                : scheduleLoading
                  ? "Loading saved sessions..."
                  : schedule?.tasks.length
                    ? "Regenerate plan"
                    : `Generate next ${roadmap?.window_days ?? 14} days`}
            </button>
          </div>
          <CoachingCard message={currentPlan.coaching_message} />
          {rollingUpdate ? <CheckpointNotice update={rollingUpdate} /> : null}
          {error ? (
            <div className="mt-5">
              <ErrorState message={error} />
            </div>
          ) : null}
          {toast.length > 0 ? (
            <div
              aria-live="polite"
              className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"
              role="status"
            >
              <p className="font-semibold">Plan updated</p>
              <p className="mt-1 text-sm">
                {toast.length === 1 && toast[0].startsWith("The schedule")
                  ? toast[0]
                  : "Moved or added sessions:"}
              </p>
              {!(toast.length === 1 && toast[0].startsWith("The schedule")) ? (
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                  {toast.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {scheduleLoading ? (
            <p className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-slate-600">
              Loading saved study sessions...
            </p>
          ) : null}
          {schedule ? (
            <div className="mt-6">
              {schedule.infeasible ? (
                <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                  Your availability is limited. {schedule.shortfall_minutes}{" "}
                  minutes could not be scheduled.
                </p>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-semibold text-ink">
                  Scheduled tasks
                </h3>
                <div
                  aria-label="Schedule view"
                  className="flex w-fit gap-1 rounded-lg bg-slate-100 p-1"
                  role="group"
                >
                  {(["list", "calendar"] as const).map((view) => (
                    <button
                      aria-pressed={viewMode === view}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                        viewMode === view
                          ? "bg-white text-brand shadow-sm"
                          : "text-slate-600"
                      }`}
                      key={view}
                      onClick={() => setViewMode(view)}
                      type="button"
                    >
                      {view}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
                {[
                  ["bg-sky-100", "Planned"],
                  ["bg-emerald-100", "Completed"],
                  ["bg-amber-100", "Partial"],
                  ["bg-rose-100", "Missed"],
                ].map(([color, label]) => (
                  <span className="inline-flex items-center gap-1.5" key={label}>
                    <span className={`size-3 rounded-sm ${color}`} />
                    {label}
                  </span>
                ))}
              </div>
              {tasks.length === 0 ? (
                <p className="mt-3 rounded-xl border border-slate-200 bg-white p-5 text-slate-600">
                  No study sessions are saved for this plan yet.
                </p>
              ) : viewMode === "list" ? (
                <ul className="mt-3 grid gap-3">
                  {tasks.map((task, index) => (
                    <li key={task.id ?? `${task.topic_id}-${index}`}>
                      <TaskCard
                        busy={busyTaskId === task.id}
                        onPartialMinutesChange={(minutes) => {
                          const taskId = task.id;
                          if (taskId) {
                            setPartialMinutes((current) => ({
                              ...current,
                              [taskId]: minutes,
                            }));
                          }
                        }}
                        onStatus={(item, status) =>
                          void updateStatus(item, status)
                        }
                        partialMinutes={
                          task.id
                            ? partialMinutes[task.id] ??
                              Math.max(1, Math.floor(task.duration_min / 2))
                            : Math.max(1, Math.floor(task.duration_min / 2))
                        }
                        task={task}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(groupedTasks)
                    .sort(
                      ([left], [right]) =>
                        new Date(left).getTime() - new Date(right).getTime(),
                    )
                    .map(([day, dayTasks]) => (
                      <section
                        aria-label={`Sessions for ${day}`}
                        className="min-w-0 rounded-xl border border-slate-200 bg-white p-3"
                        key={day}
                      >
                        <h4 className="mb-3 font-semibold text-ink">{day}</h4>
                        <ul className="grid gap-2">
                          {dayTasks.map((task, index) => (
                            <li key={task.id ?? `${task.topic_id}-${index}`}>
                              <TaskCard
                                busy={busyTaskId === task.id}
                                onPartialMinutesChange={(minutes) => {
                                  const taskId = task.id;
                                  if (taskId) {
                                    setPartialMinutes((current) => ({
                                      ...current,
                                      [taskId]: minutes,
                                    }));
                                  }
                                }}
                                onStatus={(item, status) =>
                                  void updateStatus(item, status)
                                }
                                partialMinutes={
                                  task.id
                                    ? partialMinutes[task.id] ??
                                      Math.max(
                                        1,
                                        Math.floor(task.duration_min / 2),
                                      )
                                    : Math.max(
                                        1,
                                        Math.floor(task.duration_min / 2),
                                      )
                                }
                                task={task}
                              />
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                </div>
              )}
            </div>
          ) : null}
          {roadmap ? (
            <RoadmapSection
              choosing={choosingTarget}
              onChooseTarget={(choice) => void chooseNextStep(currentPlan, choice)}
              roadmap={roadmap}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

async function loadRoadmap(planId: string): Promise<{
  roadmap: RoadmapResponse | null;
  update: RollingUpdateResponse | null;
}> {
  // The roadmap is supplementary: failures here must not block sessions.
  try {
    const roadmap = (await getRoadmap(planId)) ?? null;
    if (!roadmap?.checkpoint_due) return { roadmap, update: null };
    const update = await runCheckpoint(planId);
    return update?.ran
      ? { roadmap: update.roadmap, update }
      : { roadmap: update?.roadmap ?? roadmap, update: null };
  } catch {
    return { roadmap: null, update: null };
  }
}
