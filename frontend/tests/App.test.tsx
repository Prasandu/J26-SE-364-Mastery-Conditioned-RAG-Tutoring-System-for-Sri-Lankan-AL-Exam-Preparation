import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "../src/App";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App routes", () => {
  it("renders the home page with all four components", async () => {
    renderAt("/");

    expect(
      await screen.findByRole("heading", { name: "Practise a past paper and get it marked" }),
    ).toBeInTheDocument();
    for (const name of ["Virtual Chemistry Lab", "Past papers & marking", "Study plan", "AI tutor"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
  });

  it("links every component from the main navigation", async () => {
    renderAt("/");

    const nav = await screen.findByRole("navigation", { name: "Main" });
    for (const [label, href] of [
      ["Virtual Lab", "/lab"],
      ["Papers", "/papers"],
      ["Study plan", "/planning"],
      ["AI tutor", "/tutor"],
    ]) {
      expect(nav.querySelector(`a[href="${href}"]`)?.textContent).toBe(label);
    }
  });

  it("renders the not-found page for unknown routes", async () => {
    renderAt("/unknown");

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });

  it("protects the planning routes with the shared sign-in screen", async () => {
    renderAt("/planning/setup");

    expect(await screen.findByRole("heading", { name: "Sign in to continue" })).toBeInTheDocument();
  });

  it("protects the AI tutor with the same sign-in screen", async () => {
    renderAt("/tutor/chat");

    expect(await screen.findByRole("heading", { name: "Sign in to continue" })).toBeInTheDocument();
  });

  it("opens the virtual lab app from its page", async () => {
    renderAt("/lab");

    const link = await screen.findByRole("link", { name: /Open the Virtual Lab/ });
    expect(link).toHaveAttribute("href", "http://localhost:5174");
  });
});
