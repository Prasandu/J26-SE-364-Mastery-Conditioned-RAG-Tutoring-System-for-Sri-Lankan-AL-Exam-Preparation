import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDashboard,
  type DashboardResponse,
} from "../src/api/planning";
import PlanningDashboardPage from "../src/features/planning/DashboardPage";

vi.mock("../src/api/planning", () => ({
  getDashboard: vi.fn(),
  getMotivationToday: vi.fn(),
  submitWhatIf: vi.fn(),
}));

const emptyDashboard: DashboardResponse = {
  exam_countdown_days: 0,
  has_exam_plan: false,
  adherence: 0,
  adherence_pct: 0,
  has_adherence_data: false,
  mastery_trend: [],
  mastery_history: [],
  has_mastery_data: false,
  weak_topics: [],
  alerts: [],
  predicted_grade: "C",
  target_grade: "B",
  gap_to_target: -0.15,
  grade_gap_to_target: -0.15,
  predicted_score: 0.5,
  readiness_score: 0.5,
  current_prediction: 0.5,
  has_prediction: false,
  minimum_assessed_topics: 1,
  student_name: "there",
  coaching_message: {
    greeting: "Dear there,",
    headline: "A focused push can build momentum.",
    body: "With 0 days left, your estimated best range is C (50%).",
    focus_topics: [],
    daily_suggestion: "Use the study time available in your plan for short, focused sessions.",
    tone: "stretch",
  },
  achievability: null,
};

const populatedDashboard: DashboardResponse = {
  ...emptyDashboard,
  exam_countdown_days: 50,
  has_exam_plan: true,
  adherence: 0.7,
  adherence_pct: 70,
  has_adherence_data: true,
  mastery_trend: [
    {
      topic_id: "unit-1",
      topic_name: "Unit 1",
      parent_topic_id: null,
      mastery: 0.8,
      trend: 0.1,
    },
    {
      topic_id: "topic-1",
      topic_name: "Sub-topic",
      parent_topic_id: "unit-1",
      mastery: 0.6,
      trend: -0.1,
    },
  ],
  mastery_history: [
    {
      week_start: "2026-10-05",
      topic_id: "topic-1",
      topic_name: "Sub-topic",
      mastery: 0.45,
    },
    {
      week_start: "2026-10-12",
      topic_id: "topic-1",
      topic_name: "Sub-topic",
      mastery: 0.6,
    },
  ],
  has_mastery_data: true,
  weak_topics: [
    {
      topic_id: "topic-1",
      topic_name: "Sub-topic",
      mastery: 0.6,
      weakness_score: 0.4,
      reason: "Trending downward; revisit prior mistakes.",
    },
  ],
  alerts: [
    {
      topic_id: "topic-1",
      baseline: 1,
      recent: 0.53,
      drop: 0.47,
      attempts: [],
      latest_attempt_at: "2026-10-17T00:00:00Z",
      message: "Your recent scores in Sub-topic have declined.",
    },
  ],
  predicted_grade: "B",
  predicted_score: 0.7,
  readiness_score: 0.7,
  current_prediction: 0.7,
  has_prediction: true,
  student_name: "Amara",
  coaching_message: {
    greeting: "Dear Amara,",
    headline: "You're on track, keep your pace.",
    body: "With 50 days left, your estimated best range is B (60–75%).",
    focus_topics: [{ topic: "Sub-topic", reason: "mastery is 60%" }],
    daily_suggestion: "Aim for about 1 hour a day.",
    tone: "on_track",
  },
};

describe("PlanningDashboardPage", () => {
  beforeEach(() => {
    vi.mocked(getDashboard).mockReset();
  });

  it("shows honest empty states instead of fallback metric values", async () => {
    vi.mocked(getDashboard).mockResolvedValue(emptyDashboard);

    render(
      <MemoryRouter>
        <PlanningDashboardPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Not enough data yet. Set your exam date."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A prediction needs at least 1 assessed topic/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Submit an assessment to unlock the what-if estimate/),
    ).toBeInTheDocument();
    expect(screen.queryByText("0 days")).not.toBeInTheDocument();
    expect(screen.queryByText("50% predicted")).not.toBeInTheDocument();
  });

  it("renders charts, sub-topic mastery, and reasons when data is present", async () => {
    vi.mocked(getDashboard).mockResolvedValue(populatedDashboard);

    render(
      <MemoryRouter>
        <PlanningDashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("50")).toBeInTheDocument();
    expect(screen.getAllByText("Sub-topic").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Trending downward; revisit prior mistakes."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your recent scores in Sub-topic have declined."),
    ).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText("65% required")).toBeInTheDocument();
    expect(screen.getByText("Dear Amara,")).toBeInTheDocument();
    expect(
      screen.getByText(/estimated best range is B/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Sub-topic").length).toBeGreaterThan(0);
    expect(screen.getByText("mastery is 60%")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole("slider", { name: /Extra study time/ }),
      ).toBeInTheDocument();
    });
  });
});
