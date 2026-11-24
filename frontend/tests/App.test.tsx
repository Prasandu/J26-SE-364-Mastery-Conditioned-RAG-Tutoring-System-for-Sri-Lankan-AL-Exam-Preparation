import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "../src/App";

describe("App routes", () => {
  it("renders the papers landing page", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Exam preparation" }),
    ).toBeInTheDocument();
  });

  it("renders the not-found page for unknown routes", () => {
    render(
      <MemoryRouter initialEntries={["/unknown"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
  });

  it("protects the planning routes with the Supabase sign-in screen", async () => {
    render(
      <MemoryRouter initialEntries={["/planning/setup"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Sign in to continue" }),
    ).toBeInTheDocument();
  });
});
