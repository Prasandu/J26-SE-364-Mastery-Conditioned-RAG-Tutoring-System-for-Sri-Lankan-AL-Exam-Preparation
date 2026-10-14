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
