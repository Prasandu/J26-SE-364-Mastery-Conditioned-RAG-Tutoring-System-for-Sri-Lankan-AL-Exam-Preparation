import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import type { Role } from "@/api/types";
import { useAuth } from "@/hooks/useAuth";
import { hasRole } from "@/lib/role";

import { ErrorBox } from "./ErrorBox";
import { Spinner } from "./Spinner";

/**
 * Gates a page behind a signed-in account, and optionally a minimum role.
 *
 * Sends a signed-out visitor to /login, remembering where they were headed so they
 * land back here once signed in - see LoginPage's returnTo().
 */
export function RequireAuth({ role, children }: { readonly role?: Role; readonly children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Spinner label="Checking who you are..." />;
  }
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (role && !hasRole(user.role, role)) {
    return (
      <ErrorBox
        message={`This page needs a ${role} account`}
        hint={`You are signed in as ${user.email} (${user.role}).`}
      />
    );
  }
  return children;
}
