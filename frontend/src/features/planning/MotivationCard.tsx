import { useEffect, useState } from "react";
import { getMotivationToday, type MotivationMessage } from "../../api/planning";

const DISMISSED_KEY = "planning.motivationDismissedDate";

function dismissedDate(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function rememberDismissed(date: string) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, date);
  } catch {
    // Without storage the card simply returns on the next visit.
  }
}

/**
 * Today's motivation message. Hidden when the well-being component has
 * suppressed it, when it was dismissed today, or when it cannot be loaded.
 */
export default function MotivationCard() {
  const [message, setMessage] = useState<MotivationMessage | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => getMotivationToday())
      .then((value) => {
        if (active && value && !value.suppressed && value.text && dismissedDate() !== value.date) {
          setMessage(value);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!message?.text) return null;

  return (
    <section
      aria-label="Today's motivation"
      className="mt-5 flex items-start justify-between gap-4 rounded-3xl border border-violet-100 bg-violet-50 p-5 text-violet-950 shadow-card"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
          A thought for today
        </p>
        <p className="mt-1 text-base font-medium">{message.text}</p>
      </div>
      <button
        aria-label="Dismiss today's message"
        className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-violet-700 hover:bg-violet-100"
        onClick={() => {
          rememberDismissed(message.date);
          setMessage(null);
        }}
        type="button"
      >
        ×
      </button>
    </section>
  );
}
