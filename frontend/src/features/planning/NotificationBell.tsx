import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  generateSchedule,
  getNotificationPreferences,
  getNotifications,
  markNotificationRead,
  updateNotificationPreferences,
  type NotificationListResponse,
  type NotificationPreferences,
  type StudyNotification,
} from "../../api/planning";

export const POLL_INTERVAL_MS = 60_000;
const BROWSER_OPT_IN_KEY = "planning.browserNotifications";

function readOptIn(): boolean {
  try {
    return window.localStorage.getItem(BROWSER_OPT_IN_KEY) === "on";
  } catch {
    return false;
  }
}

function writeOptIn(value: boolean) {
  try {
    if (value) window.localStorage.setItem(BROWSER_OPT_IN_KEY, "on");
    else window.localStorage.removeItem(BROWSER_OPT_IN_KEY);
  } catch {
    // Browser storage may be unavailable; opt-in then lasts for this visit only.
  }
}

function browserNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function timeAgo(value: string): string {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

function BellIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Zm4 9a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SettingsPanel({ onDone }: { onDone: () => void }) {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    void getNotificationPreferences()
      .then((value) => {
        if (active) setPreferences(value);
      })
      .catch(() => {
        if (active) setStatus("Settings could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, []);

  if (!preferences) {
    return <p className="p-4 text-sm text-slate-600">{status || "Loading settings..."}</p>;
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!preferences) return;
    try {
      setPreferences(await updateNotificationPreferences(preferences));
      setStatus("Saved.");
    } catch {
      setStatus("Settings could not be saved.");
    }
  }

  const field = "mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  return (
    <form className="grid gap-3 p-4 text-sm" onSubmit={(event) => void save(event)}>
      <label className="flex items-center gap-2 font-medium">
        <input
          checked={preferences.enabled}
          onChange={(event) => setPreferences({ ...preferences, enabled: event.target.checked })}
          type="checkbox"
        />
        Study reminders and missed-session alerts
      </label>
      <label className="font-medium">
        Remind me before a session (minutes)
        <input
          className={field}
          max={120}
          min={0}
          onChange={(event) =>
            setPreferences({ ...preferences, reminder_lead_minutes: Number(event.target.value) })
          }
          type="number"
          value={preferences.reminder_lead_minutes}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="font-medium">
          Quiet from
          <input
            className={field}
            onChange={(event) =>
              setPreferences({ ...preferences, quiet_hours_start: event.target.value })
            }
            type="time"
            value={preferences.quiet_hours_start.slice(0, 5)}
          />
        </label>
        <label className="font-medium">
          Quiet until
          <input
            className={field}
            onChange={(event) =>
              setPreferences({ ...preferences, quiet_hours_end: event.target.value })
            }
            type="time"
            value={preferences.quiet_hours_end.slice(0, 5)}
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="rounded-full bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-dark"
          type="submit"
        >
          Save
        </button>
        <button
          className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
          onClick={onDone}
          type="button"
        >
          Back
        </button>
        {status ? <span className="text-slate-600" role="status">{status}</span> : null}
      </div>
    </form>
  );
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [data, setData] = useState<NotificationListResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "settings">("list");
  const [browserOptIn, setBrowserOptIn] = useState(
    () =>
      readOptIn() &&
      browserNotificationsSupported() &&
      window.Notification.permission === "granted",
  );
  const [actionMessage, setActionMessage] = useState("");
  const seenIds = useRef<Set<string> | null>(null);
  const optInRef = useRef(browserOptIn);
  optInRef.current = browserOptIn;

  const load = useCallback(async () => {
    try {
      const response = await getNotifications();
      if (!response) return;
      const fresh = response.notifications.filter(
        (item) => seenIds.current !== null && !seenIds.current.has(item.id),
      );
      seenIds.current = new Set([
        ...(seenIds.current ?? []),
        ...response.notifications.map((item) => item.id),
      ]);
      if (optInRef.current && browserNotificationsSupported()) {
        for (const item of fresh) {
          new window.Notification(item.title, { body: item.message, tag: item.id });
        }
      }
      setData(response);
    } catch {
      // Keep the last list; the next poll will try again.
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  async function dismiss(item: StudyNotification) {
    try {
      await markNotificationRead(item.id);
    } finally {
      await load();
    }
  }

  async function runAction(item: StudyNotification) {
    if (!item.action) return;
    setActionMessage("");
    if (item.action.kind === "reschedule" && item.action.plan_id) {
      try {
        await generateSchedule(item.action.plan_id);
        setActionMessage("Done! Your sessions were rescheduled.");
      } catch {
        setActionMessage("Rescheduling failed. Please try again from your plan.");
        return;
      }
    } else {
      setOpen(false);
      navigate("/planning/plan");
    }
    await dismiss(item);
  }

  async function enableBrowserAlerts() {
    if (!browserNotificationsSupported()) return;
    // Permission is requested only here, after the student clicks.
    const permission = await window.Notification.requestPermission();
    const granted = permission === "granted";
    writeOptIn(granted);
    setBrowserOptIn(granted);
  }

  const unread = data?.unread_count ?? 0;
  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-label={`Notifications, ${unread} unread`}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-ink"
        onClick={() => {
          setOpen((current) => !current);
          setView("list");
        }}
        type="button"
      >
        <BellIcon />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-rose-600 px-1 text-center text-xs font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          aria-label="Notifications"
          className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-3xl border border-slate-100 bg-white shadow-card text-ink shadow-xl"
          role="region"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-semibold">{view === "list" ? "Notifications" : "Notification settings"}</p>
            {view === "list" ? (
              <button
                className="text-sm font-medium text-brand hover:underline"
                onClick={() => setView("settings")}
                type="button"
              >
                Settings
              </button>
            ) : null}
          </div>
          {view === "settings" ? (
            <SettingsPanel onDone={() => setView("list")} />
          ) : (
            <div className="p-2">
              {data?.quiet_hours_active ? (
                <p className="px-2 py-1 text-xs text-slate-500">Quiet hours: new alerts are paused.</p>
              ) : null}
              {actionMessage ? (
                <p className="px-2 py-1 text-sm text-emerald-800" role="status">{actionMessage}</p>
              ) : null}
              {data?.notifications.length ? (
                <ul className="grid gap-2">
                  {data.notifications.map((item) => (
                    <li
                      className={`rounded-lg border p-3 text-sm ${
                        item.type === "missed"
                          ? "border-amber-200 bg-amber-50"
                          : "border-sky-200 bg-sky-50"
                      }`}
                      key={item.id}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">{item.title}</p>
                        <span className="shrink-0 text-xs text-slate-500">{timeAgo(item.created_at)}</span>
                      </div>
                      <p className="mt-1 text-slate-700">{item.message}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.action ? (
                          <button
                            className="rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-dark"
                            onClick={() => void runAction(item)}
                            type="button"
                          >
                            {item.action.label}
                          </button>
                        ) : null}
                        <button
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-slate-50"
                          onClick={() => void dismiss(item)}
                          type="button"
                        >
                          Mark as read
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-3 text-sm text-slate-600">You're all caught up.</p>
              )}
              {unread > (data?.notifications.length ?? 0) ? (
                <p className="px-2 pt-2 text-xs text-slate-500">
                  Showing the {data?.notifications.length} newest of {unread}.
                </p>
              ) : null}
              {browserNotificationsSupported() && !browserOptIn ? (
                <button
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                  onClick={() => void enableBrowserAlerts()}
                  type="button"
                >
                  Turn on browser alerts
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
