import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMotivationToday, type MotivationMessage } from "../src/api/planning";
import MotivationCard from "../src/features/planning/MotivationCard";

vi.mock("../src/api/planning", () => ({ getMotivationToday: vi.fn() }));

const today: MotivationMessage = {
  date: "2026-10-20",
  category: "consistency",
  message_id: "consistency-04",
  text: "Showing up again is how big progress is built, Uvindu.",
  suppressed: false,
};

describe("MotivationCard", () => {
  beforeEach(() => {
    vi.mocked(getMotivationToday).mockReset();
    window.localStorage.clear();
  });

  it("shows today's message and stays dismissed for the rest of the day", async () => {
    vi.mocked(getMotivationToday).mockResolvedValue(today);
    const view = render(<MotivationCard />);

    expect(await screen.findByText(today.text!)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss today's message" }));
    expect(screen.queryByText(today.text!)).toBeNull();

    view.unmount();
    render(<MotivationCard />);
    await waitFor(() => expect(getMotivationToday).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("region", { name: "Today's motivation" })).toBeNull();
  });

  it("comes back the next day after being dismissed", async () => {
    window.localStorage.setItem("planning.motivationDismissedDate", "2026-10-19");
    vi.mocked(getMotivationToday).mockResolvedValue(today);
    render(<MotivationCard />);

    expect(await screen.findByRole("region", { name: "Today's motivation" })).toBeInTheDocument();
  });

  it("is skipped when the well-being component flags high stress", async () => {
    vi.mocked(getMotivationToday).mockResolvedValue({
      ...today,
      category: null,
      message_id: null,
      text: null,
      suppressed: true,
    });
    render(<MotivationCard />);

    await waitFor(() => expect(getMotivationToday).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Today's motivation" })).toBeNull();
  });

  it("stays out of the way if the message cannot be loaded", async () => {
    vi.mocked(getMotivationToday).mockRejectedValue(new Error("offline"));
    render(<MotivationCard />);

    await waitFor(() => expect(getMotivationToday).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Today's motivation" })).toBeNull();
  });
});
