// The name a teacher or admin typed last time, e.g. for "approved by" - not
// authentication (see @/hooks/useAuth for that), just a convenience so it does not
// have to be retyped every time on the same device.

const NAME = "assessment.teacherRef";
const ADMIN_NAME = "assessment.adminRef";

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

export const readTeacherRef = () => read(NAME, localStorage);
export const saveTeacherRef = (value: string) => write(NAME, value, localStorage);

export const readAdminRef = () => read(ADMIN_NAME, localStorage);
export const saveAdminRef = (value: string) => write(ADMIN_NAME, value, localStorage);
