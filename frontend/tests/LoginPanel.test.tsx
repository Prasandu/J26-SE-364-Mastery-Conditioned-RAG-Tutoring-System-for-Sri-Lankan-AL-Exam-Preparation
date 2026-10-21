import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../src/auth/AuthContext";
import LoginPanel from "../src/auth/LoginPanel";

function renderPanel(
  signIn: AuthContextValue["signIn"],
  props: { configurationError?: string; authError?: string } = {},
) {
  const value: AuthContextValue = {
    session: null,
    loading: false,
    configurationError: "",
    authError: "",
    signIn,
    signOut: vi.fn(),
  };
  return render(
    <AuthContext.Provider value={value}>
      <LoginPanel {...props} />
    </AuthContext.Provider>,
  );
}

describe("LoginPanel", () => {
  it("introduces the planner to students next to the sign-in form", () => {
    renderPanel(vi.fn());

    expect(
      screen.getByRole("heading", { name: "Your A/L Chemistry study plan, built around you." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Starts from what you know")).toBeInTheDocument();
    expect(screen.getByText("Plans around your life")).toBeInTheDocument();
    expect(screen.getByText("Shows your progress")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in to continue" })).toBeInTheDocument();
  });

  it("signs in with a trimmed email and shows a progress label", async () => {
    let finish: () => void = () => undefined;
    const signIn = vi.fn(
      () => new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    renderPanel(signIn);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "  uvindu@gmail.com " } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret1" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("button", { name: "Signing in..." })).toBeDisabled();
    expect(signIn).toHaveBeenCalledWith("uvindu@gmail.com", "secret1");
    finish();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled());
  });

  it("shows a kind message when the email or password is wrong", async () => {
    renderPanel(vi.fn().mockRejectedValue(new Error("Invalid login credentials")));

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("That email or password doesn't look right. Please check them and try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Invalid login credentials")).toBeNull();
  });

  it("lets students show and hide the password they typed", () => {
    renderPanel(vi.fn());
    const password = screen.getByLabelText("Password");

    expect(password).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("explains a setup problem in plain words and hides the form", () => {
    renderPanel(vi.fn(), { configurationError: "Missing VITE_SUPABASE_URL." });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Sign-in isn't set up on this computer yet. Please ask your teacher or the project team to check the sign-in settings.",
    );
    expect(screen.getByText("Details: Missing VITE_SUPABASE_URL.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("tells new students how to get an account", () => {
    renderPanel(vi.fn());

    expect(screen.getByText(/Ask your teacher or admin to create one for you/)).toBeInTheDocument();
  });
});
