import { describe, expect, it } from "vitest";
import { friendlySignInError } from "../src/auth/authMessages";

describe("friendlySignInError", () => {
  it.each([
    ["Invalid login credentials", "That email or password doesn't look right. Please check them and try again."],
    ["Email not confirmed", "Please confirm your email first. Check your inbox for the confirmation link."],
    ["email rate limit exceeded", "Too many attempts. Please wait a minute and try again."],
    ["For security purposes, you can only request this after 12 seconds.", "Too many attempts. Please wait a minute and try again."],
    ["Failed to fetch", "We couldn't reach the sign-in service. Check your internet connection and try again."],
    ["NetworkError when attempting to fetch resource.", "We couldn't reach the sign-in service. Check your internet connection and try again."],
  ])("turns %j into plain wording", (message, expected) => {
    expect(friendlySignInError(message)).toBe(expected);
  });

  it("keeps unknown messages and has a fallback for empty ones", () => {
    expect(friendlySignInError("Account is disabled")).toBe("Account is disabled");
    expect(friendlySignInError("   ")).toBe("Sign-in didn't work. Please try again.");
  });
});
