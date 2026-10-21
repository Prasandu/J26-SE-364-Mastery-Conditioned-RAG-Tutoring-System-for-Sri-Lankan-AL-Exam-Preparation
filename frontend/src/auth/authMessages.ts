/** Turn sign-in errors into plain, kind wording for students. */
export function friendlySignInError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("invalid login credentials") || text.includes("invalid credentials")) {
    return "That email or password doesn't look right. Please check them and try again.";
  }
  if (text.includes("email not confirmed")) {
    return "Please confirm your email first. Check your inbox for the confirmation link.";
  }
  if (
    text.includes("rate limit") ||
    text.includes("too many") ||
    text.includes("for security purposes")
  ) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (
    text.includes("failed to fetch") ||
    text.includes("network") ||
    text.includes("load failed")
  ) {
    return "We couldn't reach the sign-in service. Check your internet connection and try again.";
  }
  return message.trim() || "Sign-in didn't work. Please try again.";
}

/** The platform isn't connected to its sign-in service on this computer. */
export const SETUP_PROBLEM_MESSAGE =
  "Sign-in isn't set up on this computer yet. Please ask your teacher or the project team to check the sign-in settings.";
