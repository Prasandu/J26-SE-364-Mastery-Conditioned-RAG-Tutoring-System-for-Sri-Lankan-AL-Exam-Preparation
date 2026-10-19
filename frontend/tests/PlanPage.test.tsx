import { fireEvent, render, screen } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateSchedule,
  getPlans,
  getSchedule,
} from "../src/api/planning";
import { AuthContext, type AuthContextValue } from "../src/auth/AuthContext";
import PlanningPage from "../src/features/planning/PlanPage";

vi.mock("../src/api/planning", () => ({
  generateSchedule: vi.fn(),
  getPlans: vi.fn(),
  getSchedule: vi.fn(),
  updateTaskStatus: vi.fn(),
}));

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
  },
  {
    id: "older-plan",
    mode: "manual" as const,
    exam_date: "2027-04-01",
    target_grade: "B",
    constraints: {},
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

    expect(await screen.findByText("Practice · chem-u1")).toBeInTheDocument();
    expect(getSchedule).toHaveBeenCalledWith("newest-plan");
    fireEvent.click(screen.getByRole("button", { name: "Why this task?" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Organic chemistry, Alkanes")).toBeInTheDocument();
    expect(
      screen.getByText("Your last 3 papers show a decline from 10/10 to 5/10."),
    ).toBeInTheDocument();
    expect(screen.getByText("Questions: 2020-P2-Q3, 2018-P2-Q5")).toBeInTheDocument();
  });
});
