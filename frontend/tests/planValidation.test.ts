import { describe, expect, it } from "vitest";
import { validatePlanForm, type PlanFormValues } from "../src/features/planning/planValidation";

const validManualPlan: PlanFormValues = {
  mode: "manual",
  examDate: "2027-01-01",
  targetGrade: "A",
  topics: ["chem-u3-mole-concept"],
  availability: [
    { weekday: 0, start_time: "16:00", end_time: "18:00" },
    { weekday: 2, start_time: "16:00", end_time: "18:00" },
  ],
  maxSessionMinutes: 60,
};

describe("validatePlanForm", () => {
  it("accepts valid manual and predicted plans", () => {
    expect(validatePlanForm(validManualPlan, "2026-10-14")).toEqual([]);
    expect(
      validatePlanForm(
        { ...validManualPlan, mode: "predicted", topics: [] },
        "2026-10-14",
      ),
    ).toEqual([]);
  });

  it("requires a future exam date, manual topics, and availability", () => {
    const errors = validatePlanForm(
      {
        ...validManualPlan,
        examDate: "2026-10-14",
        topics: [],
        availability: [],
      },
      "2026-10-14",
    );

    expect(errors).toContain("Choose an exam date in the future.");
    expect(errors).toContain("Choose at least one topic for a manual plan.");
    expect(errors).toContain("Add at least one weekly availability window.");
  });

  it("rejects overlapping weekly windows and out-of-range session lengths", () => {
    const errors = validatePlanForm({
      ...validManualPlan,
      maxSessionMinutes: 240,
      availability: [
        { weekday: 1, start_time: "15:00", end_time: "17:00" },
        { weekday: 1, start_time: "16:30", end_time: "18:00" },
      ],
    });

    expect(errors).toContain(
      "Availability windows on the same day cannot overlap.",
    );
    expect(errors).toContain(
      "Session length must be between 15 and 180 minutes.",
    );
  });

  it("rejects duplicate topic selections and invalid time ordering", () => {
    const errors = validatePlanForm({
      ...validManualPlan,
      topics: ["chem-u3-mole-concept", "chem-u3-mole-concept"],
      availability: [
        { weekday: 1, start_time: "18:00", end_time: "16:00" },
      ],
    });

    expect(errors).toContain("Remove duplicate topics.");
    expect(errors).toContain(
      "Each availability window needs a valid day and end after start.",
    );
  });
});

describe("daily study limit", () => {
  it("must be within range and at least one session long", () => {
    expect(validatePlanForm({ ...validManualPlan, maxDailyMinutes: 240 }, "2026-10-14")).toEqual([]);
    expect(validatePlanForm({ ...validManualPlan, maxDailyMinutes: 30 }, "2026-10-14")).toContain(
      "Daily study limit cannot be shorter than one session.",
    );
    expect(validatePlanForm({ ...validManualPlan, maxDailyMinutes: 900 }, "2026-10-14")).toContain(
      "Daily study limit must be between 15 minutes and 10 hours.",
    );
  });
});
