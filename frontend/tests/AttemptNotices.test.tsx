import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Attempt } from "../src/api/types";
import { AttemptNotices } from "../src/features/attempt/AttemptNotices";

function attempt(overrides: Partial<Attempt>): Attempt {
  return {
    id: "a1",
    paper_id: 1,
    scheme_version: 1,
    student_ref: "s@school.lk",
    mode: "digital",
    status: "submitted",
    score: 8,
    max_score: 10,
    started_at: "2026-10-01T00:00:00Z",
    submitted_at: "2026-10-01T01:00:00Z",
    marked_at: "2026-10-01T01:00:00Z",
    duration_minutes: 60,
    expires_at: "2026-10-01T01:00:00Z",
    questions: [],
    ...overrides,
  } as Attempt;
}

describe("AttemptNotices (legacy AI-marks policy)", () => {
  it("says a total is provisional and can go either way", () => {
    render(<AttemptNotices attempt={attempt({ score_is_provisional: true })} />);

    expect(screen.getByRole("note")).toHaveTextContent("provisional and can go up or down");
  });

  it("says AI-judged marks are not official, even on a marked attempt", () => {
    render(
      <AttemptNotices
        attempt={attempt({ status: "marked", includes_ai_judged_marks: true, score_is_provisional: true })}
      />,
    );

    const notes = screen.getAllByRole("note").map((note) => note.textContent);
    expect(notes.some((text) => text?.includes("not official marks"))).toBe(true);
    expect(notes.some((text) => text?.includes("provisional"))).toBe(true);
  });

  it("shows nothing for an ordinary teacher- or rule-marked result", () => {
    render(<AttemptNotices attempt={attempt({ status: "marked" })} />);

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});
