import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPlans,
  getRoadmap,
  getSchedule,
  timerAction,
  undoTaskOutcome,
  updateTaskStatus,
  type ScheduledTask,
  type TimerResponse,
} from "../src/api/planning";
import { AuthContext, type AuthContextValue } from "../src/auth/AuthContext";
import PlanningPage from "../src/features/planning/PlanPage";
import { formatElapsed } from "../src/features/planning/TaskTimer";

vi.mock("../src/api/planning", () => ({
  chooseTarget: vi.fn(),
  generateSchedule: vi.fn(),
  getPlans: vi.fn(),
  getRoadmap: vi.fn(),
  getSchedule: vi.fn(),
  runCheckpoint: vi.fn(),
  timerAction: vi.fn(),
  undoTaskOutcome: vi.fn(),
  updateTaskStatus: vi.fn(),
}));

const plan = {
  id: "plan-1",
  mode: "predicted" as const,
  exam_date: "2027-01-17",
  target_grade: "B",
  constraints: {},
  student_name: "Uvindu",
  coaching_message: {
    greeting: "Dear Uvindu,",
    headline: "Keep going.",
    body: "Steady work pays off.",
    focus_topics: [],
    daily_suggestion: "Aim for about 1 hour a day.",
    tone: "on_track" as const,
  },
};

function task(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: "task-1",
    topic_id: "chem-u9-ketones",
    activity: "error_review",
    start_at: "2026-10-20T10:30:00Z",
    duration_min: 60,
    status: "planned",
    reason: "Weak topic.",
    reason_details: null,
    steps: [],
    priority: 0.7,
    replanned_from: null,
    timer_state: "idle",
    timer_started_at: null,
    timer_elapsed_sec: 0,
    ...overrides,
  };
}

function schedule(tasks: ScheduledTask[]) {
  return { tasks, infeasible: false, shortfall_minutes: 0, unscheduled_minutes: {} };
}

function timerResult(overrides: Partial<TimerResponse>): TimerResponse {
  return {
    task: task(),
    paused_task: null,
    message: null,
    measured_minutes: null,
    suggested_actual_minutes: null,
    requires_confirmation: false,
    confirmation_reason: null,
    ...overrides,
  };
}

const auth: AuthContextValue = {
  session: { user: { id: "student-1" } } as Session,
  loading: false,
  configurationError: "",
  authError: "",
  signIn: vi.fn(),
  signOut: vi.fn(),
};

function renderPage() {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <PlanningPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("study timer", () => {
  beforeEach(() => {
    vi.mocked(getPlans).mockReset().mockResolvedValue({ plans: [plan] });
    vi.mocked(getRoadmap).mockReset().mockRejectedValue(new Error("not needed"));
    vi.mocked(getSchedule).mockReset();
    vi.mocked(timerAction).mockReset();
    vi.mocked(updateTaskStatus).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts a session and shows the live timer", async () => {
    vi.mocked(getSchedule).mockResolvedValue(schedule([task()]));
    vi.mocked(timerAction).mockResolvedValue(
      timerResult({ task: task({ timer_state: "running", timer_elapsed_sec: 0 }) }),
    );
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Start" }));

    expect(await screen.findByText("Studying")).toBeInTheDocument();
    expect(timerAction).toHaveBeenCalledWith("task-1", "start");
    expect(screen.getByRole("timer")).toHaveTextContent("0:00");
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish" })).toBeInTheDocument();
  });

  it("rebuilds a running timer from server state after a refresh and keeps ticking", async () => {
    vi.mocked(getSchedule).mockResolvedValue(
      schedule([task({ timer_state: "running", timer_elapsed_sec: 125 })]),
    );
    // Fake only the clock and intervals so findBy* (setTimeout) still works.
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    renderPage();

    expect(await screen.findByRole("timer")).toHaveTextContent("2:05");
    // The tick interval is registered in a React effect that can run a moment after the
    // clock first appears; flush it before moving time forward.
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("2:08");
  });

  it("shows a paused timer without ticking and offers Resume", async () => {
    vi.mocked(getSchedule).mockResolvedValue(
      schedule([task({ timer_state: "paused", timer_elapsed_sec: 600 })]),
    );
    renderPage();

    expect(await screen.findByRole("timer")).toHaveTextContent("10:00");
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });

  it("finishing opens a dialog with measured minutes and records the outcome", async () => {
    const running = task({ timer_state: "running", timer_elapsed_sec: 2400 });
    vi.mocked(getSchedule).mockResolvedValue(schedule([running]));
    vi.mocked(timerAction).mockResolvedValue(
      timerResult({
        task: task({ timer_state: "finished", timer_elapsed_sec: 2400 }),
        measured_minutes: 40,
        suggested_actual_minutes: 40,
      }),
    );
    vi.mocked(updateTaskStatus).mockResolvedValue({
      task: task({ status: "completed", timer_state: "finished" }),
      score_change: null,
      planned_minutes: 60,
      actual_minutes: 40,
      replanned: false,
      schedule: null,
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Finish" }));

    expect(await screen.findByText(/measured 40 minutes/)).toBeInTheDocument();
    expect(screen.getByLabelText("Minutes studied")).toHaveValue(40);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Done" }));

    await waitFor(() =>
      expect(updateTaskStatus).toHaveBeenCalledWith("task-1", {
        status: "completed",
        actual_duration_min: 40,
      }),
    );
  });

  it("asks for confirmation on an unusual session before saving", async () => {
    vi.mocked(getSchedule).mockResolvedValue(
      schedule([task({ duration_min: 30, timer_state: "running", timer_elapsed_sec: 6000 })]),
    );
    vi.mocked(timerAction)
      .mockResolvedValueOnce(
        timerResult({
          task: task({ duration_min: 30, timer_state: "running", timer_elapsed_sec: 6000 }),
          measured_minutes: 100,
          suggested_actual_minutes: 30,
          requires_confirmation: true,
          confirmation_reason: "This session ran 100 minutes. Was the timer left running?",
        }),
      )
      .mockResolvedValueOnce(
        timerResult({ task: task({ duration_min: 30, timer_state: "finished" }) }),
      );
    vi.mocked(updateTaskStatus).mockResolvedValue({
      task: task({ status: "partial" }),
      score_change: null,
      planned_minutes: 30,
      actual_minutes: 25,
      replanned: true,
      schedule: null,
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Finish" }));
    expect(await screen.findByText(/Was the timer left running/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Minutes studied"), { target: { value: "25" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Partial" }));

    await waitFor(() =>
      expect(updateTaskStatus).toHaveBeenCalledWith("task-1", {
        status: "partial",
        actual_duration_min: 25,
      }),
    );
    expect(timerAction).toHaveBeenNthCalledWith(2, "task-1", "finish", 25);
  });

  it("pauses the other running session when a new one starts", async () => {
    vi.mocked(getSchedule).mockResolvedValue(
      schedule([
        task({ id: "task-1", timer_state: "running", timer_elapsed_sec: 300 }),
        task({ id: "task-2", topic_id: "chem-u1-neutrons" }),
      ]),
    );
    vi.mocked(timerAction).mockResolvedValue(
      timerResult({
        task: task({ id: "task-2", topic_id: "chem-u1-neutrons", timer_state: "running" }),
        paused_task: task({ id: "task-1", timer_state: "paused", timer_elapsed_sec: 300 }),
        message: "Your other session was paused so you can start this one.",
      }),
    );
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Start" }));

    expect(
      await screen.findByText("Your other session was paused so you can start this one."),
    ).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(screen.getByText("Studying")).toBeInTheDocument();
  });
});

describe("formatElapsed", () => {
  it("formats minutes and hours", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(125)).toBe("2:05");
    expect(formatElapsed(3725)).toBe("1:02:05");
    expect(formatElapsed(-5)).toBe("0:00");
  });
});

describe("rescheduling after a missed session", () => {
  beforeEach(() => {
    vi.mocked(getPlans).mockReset().mockResolvedValue({ plans: [plan] });
    vi.mocked(getRoadmap).mockReset().mockRejectedValue(new Error("not needed"));
    vi.mocked(getSchedule).mockReset();
    vi.mocked(updateTaskStatus).mockReset();
  });

  it("keeps the other sessions and adds only the moved one", async () => {
    const missedTask = task({ id: "task-1" });
    const otherTask = task({ id: "task-2", topic_id: "chem-u1-neutrons", start_at: "2026-10-22T10:30:00Z" });
    const moved = task({ id: "task-3", start_at: "2026-10-23T11:30:00Z", replanned_from: "task-1" });
    vi.mocked(getSchedule)
      .mockResolvedValueOnce(schedule([missedTask, otherTask]))
      .mockResolvedValue(schedule([task({ id: "task-1", status: "missed" }), otherTask, moved]));
    vi.mocked(updateTaskStatus).mockResolvedValue({
      task: task({ id: "task-1", status: "missed" }),
      score_change: null,
      planned_minutes: 60,
      actual_minutes: 0,
      replanned: true,
      schedule: schedule([moved]),
    });
    renderPage();

    const logLinks = await screen.findAllByRole("button", { name: "Log without the timer" });
    fireEvent.click(logLinks[0]);
    fireEvent.click(screen.getByRole("button", { name: "Missed" }));

    expect(await screen.findByText("Moved or added sessions:")).toBeInTheDocument();
    await waitFor(() => expect(getSchedule).toHaveBeenCalledTimes(2));
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText(/Neutrons/)).toBeInTheDocument();
  });
});

describe("undoing a recorded outcome", () => {
  beforeEach(() => {
    vi.mocked(getPlans).mockReset().mockResolvedValue({ plans: [plan] });
    vi.mocked(getRoadmap).mockReset().mockRejectedValue(new Error("not needed"));
    vi.mocked(getSchedule).mockReset();
    vi.mocked(undoTaskOutcome).mockReset();
  });

  it("offers Undo on a recent missed session and restores it", async () => {
    vi.mocked(getSchedule)
      .mockResolvedValueOnce(schedule([task({ status: "missed", can_undo: true })]))
      .mockResolvedValue(schedule([task()]));
    vi.mocked(undoTaskOutcome).mockResolvedValue({ task: task(), removed_task_ids: ["task-9"] });
    renderPage();

    expect(await screen.findByText("Did you actually study this?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Undo missed/ }));

    expect(await screen.findByText(/Session restored and its make-up session removed/)).toBeInTheDocument();
    expect(screen.queryByText("Moved or added sessions:")).toBeNull();
    expect(undoTaskOutcome).toHaveBeenCalledWith("task-1");
    expect(await screen.findByRole("button", { name: "Start" })).toBeInTheDocument();
  });

  it("hides Undo once the window has passed", async () => {
    vi.mocked(getSchedule).mockResolvedValue(schedule([task({ status: "completed", can_undo: false })]));
    renderPage();

    await waitFor(() => expect(document.querySelector('[data-status="completed"]')).not.toBeNull());
    expect(screen.queryByRole("button", { name: /Undo/ })).toBeNull();
  });
});

describe("session card actions", () => {
  beforeEach(() => {
    vi.mocked(getPlans).mockReset().mockResolvedValue({ plans: [plan] });
    vi.mocked(getRoadmap).mockReset().mockRejectedValue(new Error("not needed"));
    vi.mocked(getSchedule).mockReset();
    vi.mocked(updateTaskStatus).mockReset();
  });

  it("keeps Start as the main action and tucks the manual buttons away", async () => {
    vi.mocked(getSchedule).mockResolvedValue(schedule([task()]));
    renderPage();

    expect(await screen.findByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Partial" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Missed" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Log without the timer" }));

    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Partial" })).toBeInTheDocument();
    expect(screen.getByText("Minutes studied")).toBeInTheDocument();
    expect(screen.getByText("(for Partial)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide manual log" }));
    expect(screen.queryByRole("button", { name: "Partial" })).toBeNull();
  });

  it("shows how many minutes were studied on a partial session", async () => {
    vi.mocked(getSchedule).mockResolvedValue(
      schedule([task({ status: "partial", actual_duration_min: 30, can_undo: true })]),
    );
    renderPage();

    expect(await screen.findByText(/30 min studied/)).toBeInTheDocument();
  });

  it("explains kindly when the rest of a partial session has no free slot", async () => {
    vi.mocked(getSchedule)
      .mockResolvedValueOnce(schedule([task()]))
      .mockResolvedValue(schedule([task({ status: "partial", actual_duration_min: 30, can_undo: true })]));
    vi.mocked(updateTaskStatus).mockResolvedValue({
      task: task({ status: "partial", actual_duration_min: 30 }),
      score_change: null,
      planned_minutes: 60,
      actual_minutes: 30,
      replanned: true,
      schedule: schedule([]),
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Log without the timer" }));
    fireEvent.click(screen.getByRole("button", { name: "Partial" }));

    expect(await screen.findByText("We couldn't fit the rest in")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Nice work on the 30 minutes you studied. We couldn't find a free time for the remaining 30 minutes in your current study window. You can add more study times in Set up.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Plan updated")).toBeNull();
    expect(updateTaskStatus).toHaveBeenCalledWith("task-1", { status: "partial", actual_duration_min: 30 });
  });

  it("explains kindly when a missed session cannot be moved", async () => {
    vi.mocked(getSchedule)
      .mockResolvedValueOnce(schedule([task()]))
      .mockResolvedValue(schedule([task({ status: "missed", can_undo: true })]));
    vi.mocked(updateTaskStatus).mockResolvedValue({
      task: task({ status: "missed" }),
      score_change: null,
      planned_minutes: 60,
      actual_minutes: 0,
      replanned: true,
      schedule: schedule([]),
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Log without the timer" }));
    fireEvent.click(screen.getByRole("button", { name: "Missed" }));

    expect(
      await screen.findByText(
        "We couldn't find a free time for this 60-minute session in your current study window. You can add more study times in Set up.",
      ),
    ).toBeInTheDocument();
  });
});
