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
