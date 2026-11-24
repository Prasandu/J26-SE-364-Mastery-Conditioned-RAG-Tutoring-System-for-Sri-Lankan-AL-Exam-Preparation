import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  chooseTarget,
  generateSchedule,
  getPlans,
  getRoadmap,
  getSchedule,
  runCheckpoint,
  type RoadmapResponse,
} from "../src/api/planning";
import { AuthContext, type AuthContextValue } from "../src/auth/AuthContext";
import PlanningPage, {
  formatActivity,
  formatStepKind,
  formatStepsSummary,
  formatTopicName,
  getWhyNowText,
  weightLabel,
} from "../src/features/planning/PlanPage";
import {
  checkpointReasonText,
  formatHours,
} from "../src/features/planning/RoadmapSection";

vi.mock("../src/api/planning", () => ({
  chooseTarget: vi.fn(),
  generateSchedule: vi.fn(),
  getPlans: vi.fn(),
  getRoadmap: vi.fn(),
  getSchedule: vi.fn(),
  runCheckpoint: vi.fn(),
  updateTaskStatus: vi.fn(),
}));

const roadmap: RoadmapResponse = {
  plan_id: "newest-plan",
  exam_date: "2026-11-30",
  days_to_exam: 42,
  window_days: 14,
  window_start: "2026-10-19",
  window_end: "2026-11-01",
  next_checkpoint: "2026-11-02",
  final_week_start: "2026-11-23",
  final_week: false,
  checkpoint_due: false,
  checkpoint_reason: null,
  deferred_topics: [],
  compression_note: null,
  target_choice: null,
  weeks: [
    {
      week_start: "2026-10-19",
      week_end: "2026-10-25",
      label: "committed",
      phase: "learning",
      topics: [
        {
          topic_id: "organic",
          topic_name: "Organic chemistry",
          hours: 6,
          focus: "practice questions",
          projected_mastery: 0.4,
        },
      ],
      total_hours: 6,
      weeks_to_exam: 5,
      compressed: false,
      compression_note: null,
    },
    {
      week_start: "2026-11-23",
      week_end: "2026-11-29",
      label: "forecast",
      phase: "final_revision",
      topics: [
        {
          topic_id: "calculations",
          topic_name: "Calculations",
          hours: 4.5,
          focus: "revision and past papers",
          projected_mastery: 0.6,
        },
      ],
      total_hours: 4.5,
      weeks_to_exam: 0,
      compressed: false,
      compression_note: null,
    },
  ],
};

const emptySchedule = {
  tasks: [],
  infeasible: false,
  shortfall_minutes: 0,
  unscheduled_minutes: {},
};

const plans = [
  {
    id: "newest-plan",
    mode: "predicted" as const,
    exam_date: "2027-06-01",
    target_grade: "A",
    constraints: {},
    student_name: "Amara",
    coaching_message: {
      greeting: "Dear Amara,",
      headline: "You're on track, keep your pace.",
      body: "With 62 days left, your estimated best range is B (60–75%).",
      focus_topics: [{ topic: "Alkanes", reason: "mastery is 35%" }],
      daily_suggestion: "Aim for about 1 hour a day.",
      tone: "on_track" as const,
    },
  },
  {
    id: "older-plan",
    mode: "manual" as const,
    exam_date: "2027-04-01",
    target_grade: "B",
    constraints: {},
    student_name: "Amara",
    coaching_message: {
      greeting: "Dear Amara,",
      headline: "A focused push can build momentum.",
      body: "With 62 days left, your estimated best range is C (45–60%).",
      focus_topics: [],
      daily_suggestion: "Aim for about 1 hour a day.",
      tone: "stretch" as const,
    },
  },
];

function authValue(loading: boolean): AuthContextValue {
  return {
    session: { user: { id: "student-1" } } as Session,
    loading,
    configurationError: "",
    authError: "",
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
}

function renderPlanPage(loading: boolean) {
  return render(
    <AuthContext.Provider value={authValue(loading)}>
      <MemoryRouter>
        <PlanningPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("PlanningPage", () => {
  beforeEach(() => {
    vi.mocked(getPlans).mockReset();
    vi.mocked(generateSchedule).mockReset();
    vi.mocked(getSchedule).mockReset();
    vi.mocked(getSchedule).mockResolvedValue(emptySchedule);
    vi.mocked(getRoadmap).mockReset();
    vi.mocked(getRoadmap).mockResolvedValue(roadmap);
    vi.mocked(runCheckpoint).mockReset();
    vi.mocked(chooseTarget).mockReset();
  });

  it("shows the full roadmap with committed and forecast weeks", async () => {
    vi.mocked(getPlans).mockResolvedValue({ plans: [plans[0]] });
    renderPlanPage(false);

    expect(
      await screen.findByRole("region", { name: "Roadmap to your exam" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Committed")).toBeInTheDocument();
    expect(screen.getByText("Forecast")).toBeInTheDocument();
    expect(screen.getByText("Final revision")).toBeInTheDocument();
    expect(screen.getByText("4.5h · revision and past papers")).toBeInTheDocument();
    expect(
      screen.getByText(/Your next 14 days are detailed in your study sessions/),
    ).toBeInTheDocument();
    expect(runCheckpoint).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Generate next 14 days" }),
    ).toBeInTheDocument();
  });

  it("runs a due checkpoint before loading sessions and explains it", async () => {
    vi.mocked(getPlans).mockResolvedValue({ plans: [plans[0]] });
    vi.mocked(getRoadmap).mockResolvedValue({
      ...roadmap,
      checkpoint_due: true,
      checkpoint_reason: "window_end",
    });
    vi.mocked(runCheckpoint).mockResolvedValue({
      plan_id: "newest-plan",
      ran: true,
      trigger: "window_end",
      adherence: 0.72,
      compressed: false,
      deferred_topics: [],
      restored_topics: [],
      explanation: null,
      target_grade: "A",
      range_change: {
        direction: "up",
        previous: 0.5,
        current: 0.58,
        message: "Your estimated score moved up from 50% to 58%. Your work is paying off!",
      },
      roadmap: { ...roadmap, window_days: 7 },
      schedule: emptySchedule,
    });
    renderPlanPage(false);

    expect(
      await screen.findByText("Checkpoint: your plan was rebuilt"),
    ).toBeInTheDocument();
    expect(screen.getByText("Your committed study window ended.")).toBeInTheDocument();
    expect(
      screen.getByText(/you completed 72% of your planned study time/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Your work is paying off/)).toBeInTheDocument();
    expect(runCheckpoint).toHaveBeenCalledWith("newest-plan");
    await waitFor(() => expect(getSchedule).toHaveBeenCalledWith("newest-plan"));
    expect(vi.mocked(runCheckpoint).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(getSchedule).mock.invocationCallOrder[0],
    );
    expect(
      await screen.findByRole("button", { name: "Generate next 7 days" }),
    ).toBeInTheDocument();
  });

  it("lets the student choose between keeping the target and adjusting the goal", async () => {
    vi.mocked(getPlans).mockResolvedValue({ plans: [plans[0]] });
    vi.mocked(getRoadmap).mockResolvedValue({
      ...roadmap,
      compression_note:
        "Last week you completed 40% of your planned study time, so we made your plan lighter. Your target grade (A) has not changed.",
      deferred_topics: [{ topic_id: "periodic", topic_name: "Periodic table" }],
      target_choice: {
        target_grade: "A",
        keep_target: {
          grade: "A",
          hours_per_day: 2.5,
          label: "Keep target A: bring back all topics and aim for about 2.5 hours a day.",
        },
        adjust_goal: {
          grade: "B",
          hours_per_day: 1,
          label: "Adjust goal to B: keep the lighter plan at your current pace.",
        },
      },
    });
    vi.mocked(chooseTarget).mockResolvedValue({
      plan_id: "newest-plan",
      ran: true,
      trigger: "target_choice",
      adherence: null,
      compressed: false,
      deferred_topics: ["periodic"],
      restored_topics: [],
      explanation:
        "Goal adjusted from A to B. Your lighter plan stays in place, and you can raise the goal again at any time.",
      target_grade: "B",
      range_change: null,
      roadmap: { ...roadmap, compression_note: "Lighter plan." },
      schedule: emptySchedule,
    });
    renderPlanPage(false);

    expect(await screen.findByText("Your plan is lighter for now")).toBeInTheDocument();
    expect(screen.getByText(/has not changed/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Adjust goal to B: keep the lighter plan at your current pace.",
      }),
    );

    expect(await screen.findByText(/Goal adjusted from A to B/)).toBeInTheDocument();
    expect(chooseTarget).toHaveBeenCalledWith("newest-plan", "adjust_goal");
    expect(
      screen.getByText("Exam date: 2027-06-01 · Target grade: B"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Keep target A/ })).toBeNull();
  });

  it("still shows sessions when the roadmap cannot be loaded", async () => {
    vi.mocked(getPlans).mockResolvedValue({ plans: [plans[0]] });
    vi.mocked(getRoadmap).mockRejectedValue(new Error("offline"));
    renderPlanPage(false);

    expect(
      await screen.findByText("No study sessions are saved for this plan yet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Roadmap to your exam" })).toBeNull();
  });

  it("waits for auth restoration and shows the newest plan with a selector", async () => {
    vi.mocked(getPlans).mockResolvedValue({ plans });
    const view = renderPlanPage(true);

    expect(
      screen.getByText("Loading your study plans..."),
    ).toBeInTheDocument();
    expect(getPlans).not.toHaveBeenCalled();

    view.rerender(
      <AuthContext.Provider value={authValue(false)}>
        <MemoryRouter>
          <PlanningPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const selector = await screen.findByRole("combobox", {
      name: "Select a saved plan",
    });
    expect(selector).toHaveValue("newest-plan");
    expect(
      screen.getByText("Exam date: 2027-06-01 · Target grade: A"),
    ).toBeInTheDocument();
    expect(screen.getByText("Dear Amara,")).toBeInTheDocument();
    expect(screen.getByText(/Alkanes:/)).toBeInTheDocument();
    expect(screen.getByText("mastery is 35%")).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: "older-plan" } });
    expect(selector).toHaveValue("older-plan");
    expect(
      screen.getByText("Exam date: 2027-04-01 · Target grade: B"),
    ).toBeInTheDocument();
  });

  it("does not show the setup empty state when the plans request fails", async () => {
    vi.mocked(getPlans).mockRejectedValue(new Error("connection failed"));
    renderPlanPage(false);

    expect(
      await screen.findByText(
        "Please check the planning service connection and try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Set up a plan" })).toBeNull();
  });

  it("loads persisted sessions for the latest plan after a new session", async () => {
    vi.mocked(getPlans).mockResolvedValue({ plans: [plans[0]] });
    vi.mocked(getSchedule).mockResolvedValue({
      ...emptySchedule,
      tasks: [
        {
          id: "saved-task",
          topic_id: "chem-u1",
          activity: "Practice",
          start_at: "2026-10-17T16:00:00Z",
          duration_min: 45,
          status: "planned",
          reason: "Review this topic.",
          reason_details: {
            topic: "Organic chemistry",
            sub_topic: "Alkanes",
            mastery: 0.35,
            has_evidence: true,
            reason: "Based on your recent results and topic priorities.",
            trend: -0.2,
            decline_alert: {
              baseline: 1,
              recent: 0.5,
              drop: 0.5,
              message: "Your last 3 papers show a decline from 10/10 to 5/10.",
            },
            exam_weight: 0.8,
            days_to_exam: 62,
            main_factors: { weakness: 0.65, urgency: 0.18 },
            activity_recommendation: "Revise your notes, then redo questions from this topic.",
          },
          steps: [
            { kind: "theory", minutes: 25, question_ids: [] },
            { kind: "practice", minutes: 35, question_ids: ["2020-P2-Q3", "2018-P2-Q5"] },
            { kind: "review", minutes: 10, question_ids: [] },
          ],
          priority: 0.8,
          replanned_from: null,
        },
      ],
    });
    renderPlanPage(false);

    expect(
      await screen.findByText("Practice · Organic chemistry, Alkanes"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Minutes studied for Organic chemistry, Alkanes")).toBeInTheDocument();
    expect(getSchedule).toHaveBeenCalledWith("newest-plan");

    fireEvent.click(screen.getByRole("button", { name: "Why this task?" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Organic chemistry, Alkanes")).toBeInTheDocument();
    expect(
      screen.getByText("Your last 3 papers show a decline from 10/10 to 5/10."),
    ).toBeInTheDocument();
    expect(screen.getByText("62 days")).toBeInTheDocument();
    expect(
      screen.getByText(
        "25 min theory, 35 min practice questions, 10 min review",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Priority factors")).toBeInTheDocument();
    expect(
      screen.getByText("Questions: 2020-P2-Q3, 2018-P2-Q5"),
    ).toBeInTheDocument();
  });

  it("renders 'not assessed yet' and plain kind language when a topic has no evidence", async () => {
    vi.mocked(getPlans).mockResolvedValue({ plans: [plans[0]] });
    vi.mocked(getSchedule).mockResolvedValueOnce({
      infeasible: false,
      shortfall_minutes: 0,
      unscheduled_minutes: {},
      tasks: [
        {
          id: "task-no-evidence",
          topic_id: "ketones",
          activity: "theory",
          start_at: "2026-10-19T16:00:00Z",
          duration_min: 60,
          status: "planned",
          reason: "No results yet for this topic.",
          reason_details: {
            topic: "Ketones",
            sub_topic: null,
            mastery: 0.3,
            has_evidence: false,
            reason: "No results yet for this topic.",
            trend: 0,
            decline_alert: null,
            exam_weight: 0.7,
            days_to_exam: 32,
            main_factors: { weakness: 0.7, urgency: 0.3 },
            activity_recommendation:
              "Learn the theory, then practise questions on this topic.",
          },
          steps: [{ kind: "theory", minutes: 60, question_ids: [] }],
          priority: 0.7,
          replanned_from: null,
        },
      ],
    });
    renderPlanPage(false);

    expect(await screen.findByText("Learn the theory · Ketones")).toBeInTheDocument();
    expect(screen.getByLabelText("Minutes studied for Ketones")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Why this task?" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Ketones")).toBeInTheDocument();
    expect(
      screen.getByText(
        "You haven't tried questions in Ketones yet, and it carries high weight in the exam.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("32 days")).toBeInTheDocument();
    expect(screen.getByText("60 min theory")).toBeInTheDocument();
  });

  it("removes the Priority factors heading when there are no factors and formats steps with minutes", async () => {
    vi.mocked(getPlans).mockResolvedValue({ plans: [plans[0]] });
    vi.mocked(getSchedule).mockResolvedValueOnce({
      infeasible: false,
      shortfall_minutes: 0,
      unscheduled_minutes: {},
      tasks: [
        {
          id: "task-no-factors",
          topic_id: "chem-u9-ketones",
          activity: "Practice",
          start_at: "2026-10-20T16:00:00Z",
          duration_min: 60,
          status: "planned",
          reason: "No evidence yet.",
          reason_details: {
            topic: "Ketones",
            sub_topic: null,
            mastery: 0.3,
            has_evidence: false,
            trend: 0,
            decline_alert: null,
            exam_weight: 0.5,
            days_to_exam: 31,
            main_factors: {},
            activity_recommendation:
              "Learn the theory, then practise questions on this topic.",
          },
          steps: [
            { kind: "theory", minutes: 20, question_ids: [] },
            { kind: "practice", minutes: 40, question_ids: ["2022-P1-Q1"] },
          ],
          priority: 0.6,
          replanned_from: null,
        },
      ],
    });
    renderPlanPage(false);

    // Readable topic name is displayed in task list
    expect(await screen.findByText("Practice · Ketones")).toBeInTheDocument();
    expect(screen.getByLabelText("Minutes studied for Ketones")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Why this task?" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // 1. Topic (readable name)
    expect(screen.getByText("Ketones")).toBeInTheDocument();
    // 2. Why now
    expect(
      screen.getByText(
        "You haven't tried questions in Ketones yet, and it carries moderate weight in the exam.",
      ),
    ).toBeInTheDocument();
    // 3. Days left to your exam (real value)
    expect(screen.getByText("31 days")).toBeInTheDocument();
    // 4. What to do in this slot, as steps with minutes
    expect(
      screen.getByText("20 min theory, 40 min practice questions"),
    ).toBeInTheDocument();
    // 5. Empty priority factors heading is removed
    expect(screen.queryByText("Priority factors")).toBeNull();
  });
});

describe("formatActivity", () => {
  it("shows readable activity names instead of internal codes", () => {
    expect(formatActivity("error_review")).toBe("Review mistakes");
    expect(formatActivity("past_paper")).toBe("Past-paper practice");
    expect(formatActivity("recovery_revision")).toBe("Recovery revision");
    expect(formatActivity("new_activity_type")).toBe("New activity type");
    expect(formatActivity("Practice")).toBe("Practice");
  });
});

describe("RoadmapSection helpers", () => {
  it("formats hours to the nearest half hour", () => {
    expect(formatHours(6)).toBe("6h");
    expect(formatHours(4.4)).toBe("4.5h");
    expect(formatHours(0.2)).toBe("0h");
  });

  it("explains why a checkpoint ran", () => {
    expect(checkpointReasonText("window_end")).toBe("Your committed study window ended.");
    expect(checkpointReasonText("new_evidence")).toBe("New assessment results arrived.");
    expect(checkpointReasonText("manual")).toBe("Your plan was refreshed.");
  });
});

describe("PlanPage formatting helpers", () => {
  it("formats topic names with reason_details, with or without sub-topics", () => {
    expect(
      formatTopicName({
        topic_id: "chem-u1",
        reason_details: { topic: "Organic chemistry", sub_topic: "Alkanes" },
      }),
    ).toBe("Organic chemistry, Alkanes");

    expect(
      formatTopicName({
        topic_id: "chem-u9-ketones",
        reason_details: { topic: "Ketones", sub_topic: null },
      }),
    ).toBe("Ketones");
  });

  it("formats raw topic IDs cleanly when reason_details is not present", () => {
    expect(
      formatTopicName({
        topic_id: "chem-u9-ketones",
      }),
    ).toBe("Ketones");

    expect(
      formatTopicName({
        topic_id: "ketones",
      }),
    ).toBe("Ketones");

    expect(
      formatTopicName({
        topic_id: "organic_chemistry",
      }),
    ).toBe("Organic Chemistry");
  });

  it("formats step kinds and steps summary with minutes", () => {
    expect(formatStepKind("practice")).toBe("practice questions");
    expect(formatStepKind("theory")).toBe("theory");
    expect(formatStepKind("review")).toBe("review");

    expect(
      formatStepsSummary([
        { kind: "theory", minutes: 20 },
        { kind: "practice", minutes: 40 },
      ]),
    ).toBe("20 min theory, 40 min practice questions");
  });

  it("labels exam weights accurately", () => {
    expect(weightLabel(0.8)).toBe("high");
    expect(weightLabel(0.5)).toBe("moderate");
    expect(weightLabel(0.2)).toBe("low");
  });

  it("generates kind, plain-language 'Why now' text", () => {
    // 1. Decline alert
    expect(
      getWhyNowText({
        topic: "Organic chemistry",
        sub_topic: "Alkanes",
        mastery: 0.5,
        trend: -0.3,
        exam_weight: 0.8,
        days_to_exam: 60,
        main_factors: {},
        activity_recommendation: "",
        decline_alert: {
          baseline: 1,
          recent: 0.5,
          drop: 0.5,
          message: "Your last 3 papers in Alkanes dropped from 10/10 to 5/10.",
        },
      }),
    ).toBe("Your last 3 papers in Alkanes dropped from 10/10 to 5/10.");

    // 2. No evidence
    expect(
      getWhyNowText({
        topic: "Ketones",
        sub_topic: null,
        mastery: 0.3,
        has_evidence: false,
        trend: 0,
        exam_weight: 0.5,
        days_to_exam: 32,
        main_factors: {},
        activity_recommendation: "",
        decline_alert: null,
      }),
    ).toBe(
      "You haven't tried questions in Ketones yet, and it carries moderate weight in the exam.",
    );

    // 3. Evidence with mastery and trend
    expect(
      getWhyNowText({
        topic: "Ketones",
        sub_topic: null,
        mastery: 0.8,
        has_evidence: true,
        trend: 0.1,
        exam_weight: 0.7,
        days_to_exam: 32,
        main_factors: {},
        activity_recommendation: "",
        decline_alert: null,
      }),
    ).toBe(
      "Your mastery in Ketones is 80% (strong) with an improving (10%) trend, and it carries high weight in the exam.",
    );
  });
});
