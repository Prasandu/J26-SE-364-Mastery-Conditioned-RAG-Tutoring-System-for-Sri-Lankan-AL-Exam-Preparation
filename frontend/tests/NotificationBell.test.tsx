import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateSchedule,
  getNotificationPreferences,
  getNotifications,
  markNotificationRead,
  updateNotificationPreferences,
  type NotificationListResponse,
  type StudyNotification,
} from "../src/api/planning";
import NotificationBell, { POLL_INTERVAL_MS } from "../src/features/planning/NotificationBell";

vi.mock("../src/api/planning", () => ({
  generateSchedule: vi.fn(),
  getNotificationPreferences: vi.fn(),
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));

function alert(overrides: Partial<StudyNotification> = {}): StudyNotification {
  return {
    id: "n-1",
    type: "reminder",
    title: "Session starting soon",
    message: "Ketones starts at 4:00 PM.",
    task_id: "task-1",
    action: { kind: "open_plan", label: "Open my plan", plan_id: null },
    created_at: new Date().toISOString(),
    read_at: null,
    ...overrides,
  };
}

function list(notifications: StudyNotification[], unread = notifications.length): NotificationListResponse {
  return { notifications, unread_count: unread, quiet_hours_active: false };
}

const shown: { title: string; body?: string }[] = [];

class FakeNotification {
  static permission: NotificationPermission = "default";
  static requestPermission = vi.fn(async () => {
    FakeNotification.permission = "granted";
    return "granted" as NotificationPermission;
  });

  constructor(title: string, options?: NotificationOptions) {
    shown.push({ title, body: options?.body });
  }
}

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );
}

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.mocked(getNotifications).mockReset();
    vi.mocked(markNotificationRead).mockReset().mockResolvedValue(alert({ read_at: "now" }));
    vi.mocked(generateSchedule).mockReset();
    vi.mocked(getNotificationPreferences).mockReset();
    vi.mocked(updateNotificationPreferences).mockReset();
    shown.length = 0;
    FakeNotification.permission = "default";
    FakeNotification.requestPermission.mockClear();
    vi.stubGlobal("Notification", FakeNotification);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the unread count and the newest alerts", async () => {
    vi.mocked(getNotifications).mockResolvedValue(
      list(
        [alert(), alert({ id: "n-2", type: "missed", title: "Missed session moved" }), alert({ id: "n-3" })],
        5,
      ),
    );
    renderBell();

    fireEvent.click(await screen.findByRole("button", { name: "Notifications, 5 unread" }));

    expect(screen.getByText("Missed session moved")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Showing the 3 newest of 5.")).toBeInTheDocument();
  });

  it("marks an alert as read and refreshes the list", async () => {
    vi.mocked(getNotifications)
      .mockResolvedValueOnce(list([alert()]))
      .mockResolvedValue(list([]));
    renderBell();

    fireEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));

    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
    expect(markNotificationRead).toHaveBeenCalledWith("n-1");
  });

  it("reschedules a missed session in one click", async () => {
    vi.mocked(getNotifications)
      .mockResolvedValueOnce(
        list([
          alert({
            type: "missed",
            title: "Missed session",
            message: "No worries, you missed Ketones at 4:00 PM. There was no free slot left.",
            action: { kind: "reschedule", label: "Find a new time", plan_id: "plan-1" },
          }),
        ]),
      )
      .mockResolvedValue(list([]));
    vi.mocked(generateSchedule).mockResolvedValue({
      tasks: [],
      infeasible: false,
      shortfall_minutes: 0,
      unscheduled_minutes: {},
    });
    renderBell();

    fireEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.click(screen.getByRole("button", { name: "Find a new time" }));

    expect(await screen.findByText("Done! Your sessions were rescheduled.")).toBeInTheDocument();
    expect(generateSchedule).toHaveBeenCalledWith("plan-1");
    expect(markNotificationRead).toHaveBeenCalledWith("n-1");
  });

  it("polls for new alerts every 60 seconds", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    vi.mocked(getNotifications).mockResolvedValue(list([]));
    renderBell();
    await waitFor(() => expect(getNotifications).toHaveBeenCalledTimes(1));

    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS);
    });

    expect(getNotifications).toHaveBeenCalledTimes(2);
  });

  it("asks for browser permission only on click, then shows new alerts as browser notifications", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    vi.mocked(getNotifications)
      .mockResolvedValueOnce(list([alert()]))
      .mockResolvedValue(list([alert({ id: "n-2", title: "Missed session moved" }), alert()]));
    renderBell();

    fireEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Turn on browser alerts" }));
    await waitFor(() => expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1));
    expect(shown).toEqual([]); // alerts already on screen are not repeated

    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS);
    });

    await waitFor(() => expect(shown).toEqual([{ title: "Missed session moved", body: "Ketones starts at 4:00 PM." }]));
    expect(window.localStorage.getItem("planning.browserNotifications")).toBe("on");
  });

  it("saves reminder lead time and quiet hours from the settings panel", async () => {
    vi.mocked(getNotifications).mockResolvedValue(list([]));
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      reminder_lead_minutes: 10,
      quiet_hours_start: "22:00:00",
      quiet_hours_end: "06:00:00",
      enabled: true,
    });
    vi.mocked(updateNotificationPreferences).mockImplementation(async (value) => value);
    renderBell();

    fireEvent.click(await screen.findByRole("button", { name: "Notifications, 0 unread" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(await screen.findByLabelText("Remind me before a session (minutes)"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("Quiet from"), { target: { value: "21:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(updateNotificationPreferences).toHaveBeenCalledWith({
      reminder_lead_minutes: 20,
      quiet_hours_start: "21:30",
      quiet_hours_end: "06:00:00",
      enabled: true,
    });
  });
});
