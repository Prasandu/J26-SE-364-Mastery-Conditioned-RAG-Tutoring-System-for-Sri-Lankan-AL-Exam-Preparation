// The student id used until the team's shared login exists.
// Kept in the browser so the same person keeps the same id between attempts.

const KEY = "assessment.studentRef";

export function readStudentRef(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return ""; // private window, or site data blocked
  }
}

export function saveStudentRef(value: string): void {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Not being able to remember the id is not worth breaking the page for.
  }
}
