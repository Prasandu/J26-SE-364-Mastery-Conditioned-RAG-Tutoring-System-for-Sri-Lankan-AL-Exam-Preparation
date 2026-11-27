import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { formulaParts } from "../src/features/tutor/components/whiteboard/formula";
import { Whiteboard } from "../src/features/tutor/components/whiteboard/Whiteboard";
import type {
  ValidatedTeaching,
  VisualAction,
  WhiteboardBlock,
} from "../src/features/tutor/types/teaching";

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

function withBlocks(blocks: WhiteboardBlock[], language: "en" | "si" = "en"): ValidatedTeaching {
  const base = example();
  return {
    ...base,
    response: {
      ...base.response!,
      schema_version: "1.1",
      language,
      learning_mode: "quick_explanation",
      verified_steps: [],
      visual_actions: [],
      blocks,
    },
  };
}

const EQUATION: WhiteboardBlock = {
  type: "chem_equation",
  reactants: [
    { coefficient: 1, formula: "Na2CO3" },
    { coefficient: 2, formula: "HCl" },
  ],
  products: [
    { coefficient: 2, formula: "NaCl" },
    { coefficient: 1, formula: "H2O(l)" },
    { coefficient: 1, formula: "CO2" },
  ],
  arrow: "->",
};

describe("Whiteboard blocks (schema 1.1)", () => {
  it("draws text, a table and a balanced equation with real subscripts", () => {
    render(
      <Whiteboard
        result={withBlocks([
          { type: "text", text: "One mole of Na2CO3 needs two moles of HCl." },
          { type: "table", caption: "Amounts", headers: ["Substance", "Moles"], rows: [["Na2CO3", "1"]] },
          EQUATION,
        ])}
      />,
    );

    expect(screen.getByText("One mole of Na2CO3 needs two moles of HCl.")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Amounts" });
    expect(within(table).getByRole("columnheader", { name: "Moles" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "Na2CO3" })).toBeInTheDocument();
    const equation = screen.getByTestId("chem-equation");
    expect(equation).toHaveTextContent("Na2CO3 + 2 HCl → 2 NaCl + H2O(l) + CO2");
    expect(equation.querySelectorAll("sub")).toHaveLength(4);
    expect(screen.getByText(/checked by the server. It is not a mark/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Steps" })).not.toBeInTheDocument();
  });

  it("shows markup and script as plain text, never as elements", () => {
    const { container } = render(
      <Whiteboard
        result={withBlocks([
          { type: "text", text: "<img src=x onerror=alert(1)>" },
          { type: "table", caption: "", headers: ["<b>h</b>"], rows: [["<script>alert(1)</script>"]] },
          { type: "html", html: "<iframe src=x></iframe>" } as unknown as WhiteboardBlock,
        ])}
      />,
    );

    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelector("img, script, iframe, b")).toBeNull();
  });

  it("uses Sinhala labels for a Sinhala whiteboard", () => {
    render(<Whiteboard result={withBlocks([EQUATION], "si")} />);

    expect(screen.getByRole("region", { name: "පුවරුව" })).toHaveAttribute("lang", "si");
    expect(screen.getByText("පරමාණු හා ආරෝපණ තුලනය පරීක්ෂා කර ඇත")).toBeInTheDocument();
  });

  it.each([
    ["Na2CO3", "Na|2:sub|CO|3:sub"],
    ["SO4^2-", "SO|4:sub|2-:sup"],
    ["Fe^3+", "Fe|3+:sup"],
    ["CuSO4·5H2O", "CuSO|4:sub|·5H|2:sub|O"],
    ["C12H22O11", "C|12:sub|H|22:sub|O|11:sub"],
    ["Ca(OH)2(aq)", "Ca(OH)|2:sub|(aq)"],
  ])("formats %s", (formula, expected) => {
    const rendered = formulaParts(formula)
      .map((part) => (part.kind === "base" ? part.text : `${part.text}:${part.kind}`))
      .join("|");
    expect(rendered).toBe(expected);
  });
});
