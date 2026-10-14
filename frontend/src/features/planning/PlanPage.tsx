import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import {
  generateSchedule,
  getPlans,
  updateTaskStatus,
  type PlanResponse,
  type ScheduleResponse,
  type ScheduledTask,
  type TaskStatus,
} from "../../api/planning";
import ErrorState from "../../components/ErrorState";
import LoadingState from "../../components/LoadingState";

type ViewMode = "list" | "calendar";

const statusStyles: Record<string, string> = {
  planned: "border-sky-200 bg-sky-50 text-sky-950",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-950",
  partial: "border-amber-200 bg-amber-50 text-amber-950",
  missed: "border-rose-200 bg-rose-50 text-rose-950",
};

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
        `${task.activity} · ${task.topic_id} — ${new Date(task.start_at).toLocaleString()}`,
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
  const style =
    statusStyles[task.status] ?? "border-slate-200 bg-white text-ink";
  const actionable = task.status === "planned" && task.id !== null;
  const validPartialMinutes =
    Number.isInteger(partialMinutes) &&
    partialMinutes >= 1 &&
    partialMinutes <= task.duration_min;

  return (
    <article
      className={`rounded-xl border p-4 shadow-sm ${style}`}
      data-status={task.status}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">
            {task.activity} · {task.topic_id}
          </p>
          <p className="mt-1 text-sm opacity-80">
            {taskDate(task)} at {taskTime(task)} · {task.duration_min} min ·{" "}
            <span className="capitalize">{task.status}</span>
          </p>
        </div>
        <details className="group relative shrink-0">
          <summary
            className="cursor-pointer list-none rounded-lg border border-current/20 px-3 py-1.5 text-sm font-medium hover:bg-white/60"
            title={task.reason}
          >
            Why this task?
          </summary>
          <p className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-lg sm:absolute sm:right-0 sm:z-10 sm:w-72">
            {task.reason}
          </p>
        </details>
      </div>

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
              aria-label={`Actual minutes for ${task.topic_id}`}
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
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [partialMinutes, setPartialMinutes] = useState<Record<string, number>>(
    {},
  );
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string[]>([]);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getPlans();
      setPlans(response.plans);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Please check the planning service connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  async function regenerate(plan: PlanResponse) {
    setGenerating(true);
    setError("");
    setToast([]);
    const previousTasks = schedule?.tasks ?? [];
    try {
      const nextSchedule = await generateSchedule(plan.id);
      setSchedule(nextSchedule);
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

  if (loading) {
    return <LoadingState label="Loading your study plans..." />;
  }
  if (error && plans.length === 0) {
    return <ErrorState message={error} onRetry={() => void loadPlans()} />;
  }

  const currentPlan = plans[0];
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
              disabled={generating}
              onClick={() => void regenerate(currentPlan)}
              type="button"
            >
              {generating
                ? "Regenerating..."
                : schedule
                  ? "Regenerate plan"
                  : "Generate next 14 days"}
            </button>
          </div>
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
                  No sessions were scheduled for this period.
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
        </>
      )}
    </section>
  );
}
