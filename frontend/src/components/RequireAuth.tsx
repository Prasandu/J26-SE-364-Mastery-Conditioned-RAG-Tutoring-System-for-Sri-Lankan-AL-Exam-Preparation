import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import type { Role } from "@/api/types";
import { useAuth } from "@/hooks/useAuth";
import { consumeSignedOut } from "@/lib/auth";
import { hasRole } from "@/lib/role";

import { ErrorBox } from "./ErrorBox";
import { Spinner } from "./Spinner";

/**
 * Gates a page behind a signed-in account, and optionally a minimum role.
 *
 * Sends a signed-out visitor to /login, remembering where they were headed so they
 * land back here once signed in - see LoginPage's returnTo(). Exception: landing
 * here with no user right after a sign-out (see consumeSignedOut) drops that
 * memory entirely - whoever signs in next, on any page, in any role, gets a plain
 * /login with no ?next=, so they always land on a fresh home page rather than
 * being sent back into a page that was the previous account's, not theirs.
 */
export function RequireAuth({ role, children }: { readonly role?: Role; readonly children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Spinner label="Checking who you are..." />;
  }
  if (!user) {
    if (consumeSignedOut()) {
      return <Navigate to="/login" replace />;
    }
    const next = encodeURIComponent(location.pathname + location.search);
    // The role this page needs travels with `next`, so LoginPage can tell whether
    // whoever signs in next can actually use it - not just send them back blind.
    const roleParam = role ? `&role=${role}` : "";
    return <Navigate to={`/login?next=${next}${roleParam}`} replace />;
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
