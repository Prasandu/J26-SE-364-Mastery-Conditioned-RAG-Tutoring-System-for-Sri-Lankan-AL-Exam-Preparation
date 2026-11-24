import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DashboardTopicTrend } from "../src/api/planning";
import UnitMastery from "../src/features/planning/UnitMastery";

function topic(topicId: string, parentId: string, mastery: number, name: string | null = null): DashboardTopicTrend {
  return { topic_id: topicId, topic_name: name, parent_topic_id: parentId, mastery, trend: 0 };
}

const topics = [
  topic("chem-u13-cell-reactions", "chem-u13-electrochemical-cells", 0.57, "Cell reactions"),
  topic("chem-u13-standard-electrode-potentials", "chem-u13-electrode-potentials", 0.82, "Standard electrode potentials"),
  topic("chem-u3-molar-mass", "chem-u3-mole-concept", 0.44, "Molar mass and particle number"),
  topic("chem-u1-neutrons", "chem-u1-subatomic-particles", 0.92, "Neutrons"),
];

describe("UnitMastery", () => {
  it("groups sub-topics into named units, weakest first, with the weakest open", () => {
    render(<UnitMastery topics={topics} />);

    const units = screen.getAllByRole("button", { expanded: true }).concat(
      screen.queryAllByRole("button", { expanded: false }),
    );
    expect(units[0]).toHaveTextContent("Unit 03 · Chemical Calculations");
    expect(units[0]).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Molar mass and particle number: 44% mastery")).toBeInTheDocument();
    // Raw IDs never appear as headings.
    expect(screen.queryByText(/chem-u3|chem u3/)).toBeNull();
  });

  it("shows only units that need attention by default and everything on request", () => {
    render(<UnitMastery topics={topics} />);

    expect(screen.queryByText(/Unit 01/)).toBeNull();
    const electrochemistry = screen.getByRole("button", { name: /Unit 13/ });
    expect(within(electrochemistry).getByText("1 to work on")).toBeInTheDocument();
    expect(within(electrochemistry).getByText("70%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All units" }));
    expect(screen.getByRole("button", { name: /Unit 01/ })).toBeInTheDocument();
  });

  it("expands and collapses a unit to show its sub-topics", () => {
    render(<UnitMastery topics={topics} />);
    const electrochemistry = screen.getByRole("button", { name: /Unit 13/ });

    fireEvent.click(electrochemistry);
    expect(electrochemistry).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Cell reactions: 57% mastery")).toBeInTheDocument();

    fireEvent.click(electrochemistry);
    expect(screen.queryByLabelText("Cell reactions: 57% mastery")).toBeNull();
  });

  it("celebrates when every unit is strong", () => {
    render(<UnitMastery topics={[topic("chem-u1-neutrons", "chem-u1-subatomic-particles", 0.92)]} />);

    expect(screen.getByText(/Every unit is at 75% or higher/)).toBeInTheDocument();
  });
});
