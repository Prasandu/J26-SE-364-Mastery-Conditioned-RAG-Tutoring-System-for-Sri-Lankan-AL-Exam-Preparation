import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Whiteboard } from "../src/features/tutor/components/whiteboard/Whiteboard";
import type { ValidatedTeaching, VisualAction } from "../src/features/tutor/types/teaching";

function example(overrides: Partial<ValidatedTeaching> = {}): ValidatedTeaching {
  return {
    status: "verified",
    checks: [],
    problems: [],
    response: {
      response_id: "r1",
      language: "en",
      spoken_text: "Divide the amount by the volume.",
      citations: [],
      learning_mode: "worked_example",
      verified_steps: [
        { id: "m", kind: "given", label: "Mass of Na2CO3", formula: "m = 26.5", result: "26.5 g" },
        { id: "v", kind: "unit_conversion", label: "Volume", formula: "V = Vcm / 1000", result: "0.250 dm3" },
        { id: "n", kind: "calculation", label: "Amount", formula: "n = m / M", result: "0.250 mol" },
        { id: "c", kind: "calculation", label: "Concentration", formula: "c = n / V", result: "1.00 mol dm-3" },
      ],
      visual_actions: [
        { type: "writeEquation", step_id: "v" },
        { type: "pause", seconds: 1 },
        { type: "writeEquation", step_id: "n" },
        { type: "writeEquation", step_id: "c" },
        { type: "highlightStep", step_id: "c" },
        // An action type this renderer does not know: ignored, never executed.
        { type: "runScript", step_id: "c" } as unknown as VisualAction,
      ],
    },
    ...overrides,
  };
}

describe("Whiteboard (TUT-014)", () => {
  it("reveals verified steps one at a time, in action order", () => {
    render(<Whiteboard result={example()} />);
    const steps = screen.getByRole("list", { name: "Steps" });

    expect(within(steps).getAllByRole("listitem")).toHaveLength(1);
    expect(within(steps).getByText("V = Vcm / 1000 = 0.250 dm3")).toBeInTheDocument();
    expect(screen.getByText(/Mass of Na2CO3/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(within(steps).getAllByRole("listitem")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Show all steps" }));
    const items = within(steps).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "VolumeV = Vcm / 1000 = 0.250 dm3",
      "Amountn = m / M = 0.250 mol",
      "Concentrationc = n / V = 1.00 mol dm-3",
    ]);
    expect(items[2]).toHaveAttribute("aria-current", "step");
    expect(screen.queryByRole("button", { name: "Next step" })).not.toBeInTheDocument();
  });

  it("shows nothing from a rejected response", () => {
    render(<Whiteboard result={example({ status: "rejected" })} />);

    expect(screen.getByRole("status")).toHaveTextContent("could not be checked");
    expect(screen.queryByText(/1.00 mol dm-3/)).not.toBeInTheDocument();
  });

  it("says when only part of the display could be checked", () => {
    render(<Whiteboard result={example({ status: "partially_verified" })} />);

    expect(screen.getByRole("note")).toHaveTextContent("Every number below was checked");
  });
});
