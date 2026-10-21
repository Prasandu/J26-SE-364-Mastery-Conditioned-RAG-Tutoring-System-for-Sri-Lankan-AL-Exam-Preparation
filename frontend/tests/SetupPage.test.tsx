import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPlan,
  getPlanReadiness,
  getPlans,
  replacePlan,
} from "../src/api/planning";
import PlanningSetupPage from "../src/features/planning/SetupPage";

vi.mock("../src/api/planning", () => ({
  createPlan: vi.fn(),
  getPlanReadiness: vi.fn(),
  getPlans: vi.fn(),
  replacePlan: vi.fn(),
}));

const existingPlan = {
  id: "latest-plan",
  mode: "predicted" as const,
  exam_date: "2027-06-01",
  target_grade: "A",
  constraints: {},
};

function renderSetupPage() {
  return render(
    <MemoryRouter>
      <PlanningSetupPage />
    </MemoryRouter>,
  );
}

describe("PlanningSetupPage", () => {
  beforeEach(() => {
    vi.mocked(createPlan).mockReset();
    vi.mocked(getPlans).mockReset();
    vi.mocked(replacePlan).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks before replacing an existing plan and uses PUT after confirmation", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    vi.mocked(getPlans).mockResolvedValue({ plans: [existingPlan] });
    vi.mocked(replacePlan).mockResolvedValue(existingPlan);
    renderSetupPage();

    fireEvent.click(screen.getByRole("button", { name: "Save my plan" }));

    await waitFor(() => {
      expect(replacePlan).toHaveBeenCalledWith(
        "latest-plan",
        expect.objectContaining({ mode: "predicted" }),
      );
    });
    expect(confirm).toHaveBeenCalledOnce();
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("does not create another plan when replacement is declined", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    vi.mocked(getPlans).mockResolvedValue({ plans: [existingPlan] });
    renderSetupPage();

    fireEvent.click(screen.getByRole("button", { name: "Save my plan" }));

    await waitFor(() => expect(getPlans).toHaveBeenCalledOnce());
    expect(confirm).toHaveBeenCalledOnce();
    expect(replacePlan).not.toHaveBeenCalled();
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("creates the first plan when the API returns an empty list", async () => {
    vi.mocked(getPlans).mockResolvedValue({ plans: [] });
    vi.mocked(createPlan).mockResolvedValue(existingPlan);
    renderSetupPage();

    fireEvent.click(screen.getByRole("button", { name: "Save my plan" }));

    await waitFor(() => {
      expect(createPlan).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "predicted" }),
      );
    });
    expect(replacePlan).not.toHaveBeenCalled();
  });
});

describe("weekly availability with several slots per day", () => {
  beforeEach(() => {
    vi.mocked(createPlan).mockReset().mockResolvedValue(existingPlan);
    vi.mocked(getPlans).mockReset().mockResolvedValue({ plans: [] });
  });

  it("sends a morning and an evening slot for the same day", async () => {
    renderSetupPage();

    fireEvent.click(screen.getByRole("button", { name: "Add another Monday time" }));
    fireEvent.change(screen.getByLabelText("Monday start time"), { target: { value: "06:00" } });
    fireEvent.change(screen.getByLabelText("Monday end time"), { target: { value: "07:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save my plan" }));

    await waitFor(() => expect(createPlan).toHaveBeenCalled());
    const monday = vi
      .mocked(createPlan)
      .mock.calls[0][0].availability_windows.filter((window) => window.weekday === 0);
    expect(monday).toEqual([
      { weekday: 0, start_time: "06:00", end_time: "07:30" },
      { weekday: 0, start_time: "19:00", end_time: "21:00" },
    ]);
  });

  it("removes a slot and blocks overlapping slots", async () => {
    renderSetupPage();

    fireEvent.click(screen.getByRole("button", { name: "Add another Monday time" }));
    fireEvent.change(screen.getByLabelText("Monday start time 2"), { target: { value: "17:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save my plan" }));

    expect(
      await screen.findByText("Availability windows on the same day cannot overlap."),
    ).toBeInTheDocument();
    expect(createPlan).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove Monday time 2" }));
    expect(screen.queryByLabelText("Monday start time 2")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save my plan" }));
    await waitFor(() => expect(createPlan).toHaveBeenCalled());
  });
});

describe("daily study limit", () => {
  beforeEach(() => {
    vi.mocked(createPlan).mockReset().mockResolvedValue(existingPlan);
    vi.mocked(getPlans).mockReset().mockResolvedValue({ plans: [] });
  });

  it("sends the chosen daily limit instead of a fixed 180 minutes", async () => {
    renderSetupPage();

    fireEvent.change(screen.getByLabelText(/Maximum study per day/), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "Save my plan" }));

    await waitFor(() =>
      expect(createPlan).toHaveBeenCalledWith(expect.objectContaining({ max_daily_minutes: 300 })),
    );
    expect(screen.getByRole("option", { name: "5 hours" })).toBeInTheDocument();
  });

  it("blocks a daily limit shorter than one session", async () => {
    renderSetupPage();

    fireEvent.change(screen.getByLabelText(/Maximum study per day/), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save my plan" }));

    expect(
      await screen.findByText("Daily study limit cannot be shorter than one session."),
    ).toBeInTheDocument();
    expect(createPlan).not.toHaveBeenCalled();
  });
});

describe("editing an existing plan", () => {
  const savedPlan = {
    ...existingPlan,
    mode: "predicted" as const,
    exam_date: "2027-01-17",
    target_grade: "B",
    constraints: {
      mode: "predicted",
      topics: [],
      max_session_minutes: 45,
      max_daily_minutes: 240,
      availability_windows: [
        { weekday: 1, start_time: "06:00:00", end_time: "07:30:00" },
        { weekday: 1, start_time: "19:00:00", end_time: "21:00:00" },
        { weekday: 4, start_time: "16:00:00", end_time: "18:00:00" },
      ],
    },
  };

  beforeEach(() => {
    vi.mocked(getPlans).mockReset().mockResolvedValue({ plans: [savedPlan] });
    vi.mocked(replacePlan).mockReset().mockResolvedValue(savedPlan);
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  it("prefills the form with the current plan's settings", async () => {
    renderSetupPage();

    expect(await screen.findByText(/These are your current plan's settings/)).toBeInTheDocument();
    expect(screen.getByLabelText("Exam date")).toHaveValue("2027-01-17");
    expect(screen.getByLabelText("Target grade")).toHaveValue("B");
    expect(screen.getByLabelText("Maximum session length")).toHaveValue("45");
    expect(screen.getByLabelText(/Maximum study per day/)).toHaveValue("240");
    expect(screen.getByLabelText("Tuesday start time")).toHaveValue("06:00");
    expect(screen.getByLabelText("Tuesday start time 2")).toHaveValue("19:00");
    expect(screen.getByLabelText("Friday end time")).toHaveValue("18:00");
    expect(screen.getByLabelText("Monday start time")).toBeDisabled();
  });

  it("saves one change while keeping everything else", async () => {
    renderSetupPage();
    await screen.findByText(/These are your current plan's settings/);

    fireEvent.change(screen.getByLabelText("Target grade"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "Save my plan" }));

    await waitFor(() => expect(replacePlan).toHaveBeenCalled());
    const [planId, data] = vi.mocked(replacePlan).mock.calls[0];
    expect(planId).toBe("latest-plan");
    expect(data).toEqual(
      expect.objectContaining({
        target_grade: "A",
        exam_date: "2027-01-17",
        max_session_minutes: 45,
        max_daily_minutes: 240,
        availability_windows: [
          { weekday: 1, start_time: "06:00", end_time: "07:30" },
          { weekday: 1, start_time: "19:00", end_time: "21:00" },
          { weekday: 4, start_time: "16:00", end_time: "18:00" },
        ],
      }),
    );
    expect(getPlans).toHaveBeenCalledTimes(1);
  });
});


describe("Adaptive plans for students without results", () => {
  const reason =
    "Adaptive plans pick your topics from your assessment results, and you don't have any yet. " +
    "Take a quiz or past paper first, or choose a Manual plan and pick the topics you want to start with.";

  beforeEach(() => {
    vi.mocked(createPlan).mockReset().mockResolvedValue(existingPlan);
    vi.mocked(getPlans).mockReset().mockResolvedValue({ plans: [] });
    vi.mocked(getPlanReadiness).mockReset();
  });

  it("disables Adaptive, explains why, and starts in Manual mode", async () => {
    vi.mocked(getPlanReadiness).mockResolvedValue({
      has_results: false,
      adaptive_available: false,
      adaptive_unavailable_reason: reason,
    });
    renderSetupPage();

    expect(await screen.findByText("Adaptive isn't available yet.")).toBeInTheDocument();
    expect(screen.getByText(/you don't have any yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adaptive" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Manual" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Choose topics")).toBeInTheDocument();
  });

  it("asks a new student to pick topics instead of sending an Adaptive plan", async () => {
    vi.mocked(getPlanReadiness).mockResolvedValue({
      has_results: false,
      adaptive_available: false,
      adaptive_unavailable_reason: reason,
    });
    renderSetupPage();
    await screen.findByText("Adaptive isn't available yet.");

    fireEvent.click(screen.getByRole("button", { name: "Save my plan" }));

    expect(await screen.findByText("Choose at least one topic for a manual plan.")).toBeInTheDocument();
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("keeps Adaptive available for students who have results", async () => {
    vi.mocked(getPlanReadiness).mockResolvedValue({
      has_results: true,
      adaptive_available: true,
      adaptive_unavailable_reason: null,
    });
    renderSetupPage();

    fireEvent.click(await screen.findByRole("button", { name: "Save my plan" }));

    await waitFor(() =>
      expect(createPlan).toHaveBeenCalledWith(expect.objectContaining({ mode: "predicted" })),
    );
    expect(screen.queryByText("Adaptive isn't available yet.")).toBeNull();
    expect(screen.getByRole("button", { name: "Adaptive" })).toBeEnabled();
  });
});
