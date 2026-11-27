import { request } from "./client";

// Class rosters: a teacher reviews only students in a class they teach (admins see all).
export interface SchoolClass {
  id: number;
  name: string;
  academic_year: string | null;
  archived: boolean;
  teacher_ids: number[];
  student_ids: number[];
}

export function listClasses(signal?: AbortSignal): Promise<SchoolClass[]> {
  return request<SchoolClass[]>("/admin/classes", { signal });
}

export function createClass(body: { name: string; academic_year: string | null }): Promise<SchoolClass> {
  return request<SchoolClass>("/admin/classes", { method: "POST", body });
}

export function setClassTeachers(classId: number, userIds: number[]): Promise<SchoolClass> {
  return request<SchoolClass>(`/admin/classes/${classId}/teachers`, {
    method: "PUT",
    body: { user_ids: userIds },
  });
}

export function setClassStudents(classId: number, userIds: number[]): Promise<SchoolClass> {
  return request<SchoolClass>(`/admin/classes/${classId}/students`, {
    method: "PUT",
    body: { user_ids: userIds },
  });
}

export function archiveClass(classId: number): Promise<SchoolClass> {
  return request<SchoolClass>(`/admin/classes/${classId}/archive`, { method: "POST" });
}
