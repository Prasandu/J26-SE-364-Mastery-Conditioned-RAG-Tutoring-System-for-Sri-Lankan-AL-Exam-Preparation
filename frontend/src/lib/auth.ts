// The signed-in user's token, kept in the browser between page loads.
//
// localStorage, not sessionStorage (unlike the teacher/admin keys in lib/teacher.ts):
// a student's login should survive closing the tab, the same way the shared keys
// deliberately do not.

const TOKEN = "assessment.authToken";
const ROLE = "assessment.authRole";

function read(name: string): string {
  try {
    return localStorage.getItem(name) ?? "";
  } catch {
    return ""; // private window, or site data blocked
  }
}

function write(name: string, value: string): void {
  try {
    localStorage.setItem(name, value);
  } catch {
    // Not remembering it is better than breaking the page.
  }
}

function clear(name: string): void {
  try {
    localStorage.removeItem(name);
  } catch {
    // Nothing to do if storage is blocked - there was nothing to clear.
  }
}

export const readToken = () => read(TOKEN);
export const readRole = () => read(ROLE);

export function saveSession(token: string, role: string): void {
  write(TOKEN, token);
  write(ROLE, role);
}

export function clearSession(): void {
  clear(TOKEN);
  clear(ROLE);
}

// Set for one render when logout() runs, so RequireAuth can tell "signed out of
// this page just now" apart from "never signed in, landed here directly" - the
// former must never carry a ?next= back into the login page, whatever role signs
// in next; the latter should. In-memory only (not storage): it only needs to
// survive the handful of renders right after sign-out, in this same tab.
let justSignedOut = false;

export function markSignedOut(): void {
  justSignedOut = true;
}

/** True once, then resets - call this exactly where the redirect decision is made. */
export function consumeSignedOut(): boolean {
  const was = justSignedOut;
  justSignedOut = false;
  return was;
}
