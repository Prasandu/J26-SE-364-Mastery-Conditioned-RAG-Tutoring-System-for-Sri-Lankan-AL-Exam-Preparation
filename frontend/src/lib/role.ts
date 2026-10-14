import type { Role } from "@/api/types";

// Mirrors ROLE_RANK in app/services/auth.py: a role is a tier, so admin passes a
// check that only asks for teacher, the same way the backend admits it.
const RANK: Record<Role, number> = { student: 0, teacher: 1, admin: 2 };

export function hasRole(have: Role, need: Role): boolean {
  return RANK[have] >= RANK[need];
}
