import { useEffect, useState, type ReactNode } from "react";
import Modal from "../../components/Modal";
import type {
  ScheduledTask,
  TaskStatus,
  TimerAction,
  TimerResponse,
} from "../../api/planning";

export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

/**
 * Live elapsed time. The server's elapsed seconds are the source of truth; the
 * browser only adds the time since that response arrived. Re-keyed by the
 * parent whenever server state changes, so a refresh rebuilds it from the server.
 */
function ElapsedClock({
  baseSeconds,
  running,
}: {
  baseSeconds: number;
  running: boolean;
}) {
  const [receivedAt] = useState(() => Date.now());
  const [now, setNow] = useState(receivedAt);

  useEffect(() => {
    if (!running) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [running]);

  const seconds = baseSeconds + (running ? (now - receivedAt) / 1000 : 0);
  return (
    <span
      aria-label="Elapsed study time"
      className="font-mono text-sm font-semibold tabular-nums"
      role="timer"
    >
      {formatElapsed(seconds)}
    </span>
  );
}

export function TimerControls({
  task,
  busy,
  onAction,
  extra,
}: {
  task: ScheduledTask;
  busy: boolean;
  onAction: (task: ScheduledTask, action: TimerAction) => void;
  // Shown beside Start while the timer is idle (e.g. the "log without the timer" link).
  extra?: ReactNode;
}) {
  const state = task.timer_state ?? "idle";
  if (task.status !== "planned" || task.id === null || state === "finished") {
    return null;
  }
  const button =
    "rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50";

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-current/10 pt-3">
      {state === "idle" ? (
        <>
          <button
            className={`${button} bg-brand text-white hover:bg-brand-dark`}
            disabled={busy}
            onClick={() => onAction(task, "start")}
            type="button"
          >
            Start
          </button>
          {extra}
        </>
      ) : (
        <>
          <span
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 ${
              state === "running"
                ? "bg-emerald-100 text-emerald-900"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            <span className="text-xs font-medium">
              {state === "running" ? "Studying" : "Paused"}
            </span>
            <ElapsedClock
              baseSeconds={task.timer_elapsed_sec ?? 0}
              key={`${state}-${task.timer_elapsed_sec ?? 0}`}
              running={state === "running"}
            />
          </span>
          {state === "running" ? (
            <button
              className={`${button} border border-slate-300 bg-white text-ink hover:bg-slate-50`}
              disabled={busy}
              onClick={() => onAction(task, "pause")}
              type="button"
            >
              Pause
            </button>
          ) : (
            <button
              className={`${button} bg-brand text-white hover:bg-brand-dark`}
              disabled={busy}
              onClick={() => onAction(task, "resume")}
              type="button"
            >
              Resume
            </button>
          )}
          <button
            className={`${button} bg-emerald-700 text-white hover:bg-emerald-800`}
            disabled={busy}
            onClick={() => onAction(task, "finish")}
            type="button"
          >
            Finish
          </button>
        </>
      )}
    </div>
  );
}

export function FinishDialog({
  task,
  result,
  busy,
  onSubmit,
  onCancel,
}: {
  task: ScheduledTask;
  result: TimerResponse;
  busy: boolean;
  onSubmit: (status: TaskStatus, minutes: number | null) => void;
  onCancel: () => void;
}) {
  const [minutes, setMinutes] = useState(
    result.suggested_actual_minutes ?? result.measured_minutes ?? 0,
  );
  const validMinutes =
    Number.isInteger(minutes) && minutes >= 1 && minutes <= task.duration_min;

  return (
    <Modal labelledBy="finish-session-title" onClose={onCancel}>
        <h3 className="text-xl font-bold" id="finish-session-title">
          How did this session go?
        </h3>
        <p className="mt-2 text-sm text-slate-700">
          The timer measured {result.measured_minutes ?? 0} minutes of study
          (planned {task.duration_min}).
        </p>
        {result.requires_confirmation ? (
          <p className="mt-3 rounded-full bg-amber-50 p-3 text-sm text-amber-950">
            {result.confirmation_reason}
          </p>
        ) : null}
        <label className="mt-4 flex items-center gap-2 text-sm font-medium">
          Minutes studied
          <input
            aria-label="Minutes studied"
            className="w-24 rounded-md border border-slate-300 px-2 py-2 text-sm"
            max={task.duration_min}
            min={1}
            onChange={(event) => setMinutes(Number(event.target.value))}
            type="number"
            value={minutes}
          />
        </label>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            disabled={busy || !validMinutes}
            onClick={() => onSubmit("completed", minutes)}
            type="button"
          >
            Done
          </button>
          <button
            className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            disabled={busy || !validMinutes}
            onClick={() => onSubmit("partial", minutes)}
            type="button"
          >
            Partial
          </button>
          <button
            className="rounded-full bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
            disabled={busy}
            onClick={() => onSubmit("missed", null)}
            type="button"
          >
            Missed
          </button>
          <button
            className="ml-auto rounded-full border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        </div>
    </Modal>
  );
}
