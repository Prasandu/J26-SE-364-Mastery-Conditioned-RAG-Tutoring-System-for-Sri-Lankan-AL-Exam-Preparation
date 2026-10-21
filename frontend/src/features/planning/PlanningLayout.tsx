import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { AuthProvider } from "../../auth/AuthProvider";
import { useAuth } from "../../auth/AuthContext";
import LoginPanel from "../../auth/LoginPanel";
import ErrorState from "../../components/ErrorState";
import LoadingState from "../../components/LoadingState";
import NotificationBell from "./NotificationBell";

const navigation = [
  { to: "/planning/dashboard", label: "Dashboard" },
  { to: "/planning/plan", label: "Study plan" },
  { to: "/planning/setup", label: "Set up" },
];

function displayName(session: Session): string {
  const metadata = session.user.user_metadata ?? {};
  const name = metadata.full_name ?? metadata.name ?? metadata.first_name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return session.user.email?.split("@")[0] ?? "Student";
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "S";
}

function FlaskIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M9 3h6M10 3v6.2L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.2V3M7.5 15h9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function AuthenticatedPlanningLayout() {
  const { session, loading, configurationError, authError, signOut } = useAuth();
  const [signOutError, setSignOutError] = useState("");

  if (loading) {
    return <LoadingState label="Checking your sign-in..." />;
  }
  if (!session) {
    return (
      <div className="min-h-screen bg-page">
        <LoginPanel authError={authError} configurationError={configurationError} />
      </div>
    );
  }

  const name = displayName(session);
  return (
    <div className="min-h-screen bg-page">
      <div className="sticky top-0 z-30 px-4 pt-4 sm:px-6">
        <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-[1.75rem] border border-slate-100 bg-white/95 px-4 py-2.5 shadow-card backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-brand-soft text-brand">
              <FlaskIcon />
            </span>
            <p className="text-base font-semibold text-ink">
              A/L Chemistry{" "}
              <span className="text-sm font-normal text-slate-500">Planner</span>
            </p>
          </div>
          <nav aria-label="Planning" className="order-3 flex w-full justify-center gap-1 md:order-none md:w-auto">
            {navigation.map(({ to, label }) => (
              <NavLink
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    isActive ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-ink"
                  }`
                }
                key={to}
                to={to}
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 sm:flex">
              <span className="grid size-7 place-items-center rounded-full bg-brand text-xs font-semibold text-white">
                {initials(name)}
              </span>
              <span className="max-w-32 truncate text-sm font-medium text-ink">{name}</span>
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[0.65rem] font-semibold tracking-wider text-brand">
                STUDENT
              </span>
            </div>
            <button
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-ink"
              onClick={() => {
                setSignOutError("");
                void signOut().catch((cause: unknown) =>
                  setSignOutError(cause instanceof Error ? cause.message : "Could not sign out."),
                );
              }}
              type="button"
            >
              <SignOutIcon />
              Sign out
            </button>
          </div>
        </header>
      </div>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {signOutError ? (
          <div className="mb-5">
            <ErrorState message={signOutError} />
          </div>
        ) : null}
        <Outlet />
      </main>
    </div>
  );
}

export default function PlanningLayout() {
  return (
    <AuthProvider>
      <AuthenticatedPlanningLayout />
    </AuthProvider>
  );
}
