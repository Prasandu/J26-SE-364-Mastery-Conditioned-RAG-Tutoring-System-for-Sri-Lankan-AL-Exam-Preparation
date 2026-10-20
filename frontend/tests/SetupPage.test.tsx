import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPlan,
  getPlans,
  replacePlan,
} from "../src/api/planning";
import PlanningSetupPage from "../src/features/planning/SetupPage";

vi.mock("../src/api/planning", () => ({
  createPlan: vi.fn(),
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
