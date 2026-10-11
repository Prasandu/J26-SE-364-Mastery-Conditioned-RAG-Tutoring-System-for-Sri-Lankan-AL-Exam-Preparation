// The teacher's key and name, until the team's shared login exists.
//
// The key is kept in sessionStorage, not localStorage: it closes with the tab,
// so a shared school computer does not keep it after the teacher walks away.

const KEY = "assessment.teacherKey";
const NAME = "assessment.teacherRef";

function read(name: string, store: Storage): string {
  try {
    return store.getItem(name) ?? "";
  } catch {
    return "";
  }
}

function write(name: string, value: string, store: Storage): void {
  try {
    store.setItem(name, value);
  } catch {
    // Not remembering it is better than breaking the page.
  }
}

export const readTeacherKey = () => read(KEY, sessionStorage);
export const saveTeacherKey = (value: string) => write(KEY, value, sessionStorage);
export const readTeacherRef = () => read(NAME, localStorage);
export const saveTeacherRef = (value: string) => write(NAME, value, localStorage);
