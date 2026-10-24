import { useEffect, useRef, useState } from "react";

interface Props {
  // When the time runs out, as the server worked it out - not a duration counted
  // from when this page happened to load.
  readonly expiresAt: string;
  readonly durationMinutes: number;
  readonly onExpire: () => void;
}

// Under five minutes the student should be finishing, not reading; under one it is
// about to submit itself.
const WARN_SECONDS = 5 * 60;
const URGENT_SECONDS = 60;

function secondsLeft(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

/** Time remaining, counted down to the server's deadline. Calls onExpire once. */
export function ExamTimer({ expiresAt, durationMinutes, onExpire }: Props) {
  const [left, setLeft] = useState(() => secondsLeft(expiresAt));
  // Submitting twice would be worse than not submitting at all.
  const fired = useRef(false);

  useEffect(() => {
    const tick = setInterval(() => setLeft(secondsLeft(expiresAt)), 1000);
    return () => clearInterval(tick);
  }, [expiresAt]);

  useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true;
      onExpire();
    }
  }, [left, onExpire]);

  const urgent = left <= URGENT_SECONDS;
  const warn = left <= WARN_SECONDS;
  const tone = urgent
    ? "border-rose-300 bg-rose-50 text-rose-900"
    : warn
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-white text-slate-700";

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5 ${tone}`}
      role="timer"
      aria-live={warn ? "polite" : "off"}
    >
      <span className="text-sm font-medium">Time left</span>
      <span className="font-mono text-2xl font-semibold tabular-nums">{clock(left)}</span>
      <span className="text-xs opacity-80">of {durationMinutes} minutes</span>
      {left === 0 ? (
        <span className="text-xs font-medium">Time is up - submitting your answers</span>
      ) : (
        urgent && <span className="text-xs font-medium">Your paper submits itself at 0:00</span>
      )}
    </div>
  );
}

function clock(total: number): string {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
