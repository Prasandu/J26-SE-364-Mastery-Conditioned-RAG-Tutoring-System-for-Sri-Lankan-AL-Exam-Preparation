import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthProvider";
import { useAuth } from "../../auth/AuthContext";
import LoginPanel from "../../auth/LoginPanel";
import ErrorState from "../../components/ErrorState";
import LoadingState from "../../components/LoadingState";

const navigation = [
  { to: "/planning/setup", label: "Set up" },
  { to: "/planning/plan", label: "Study plan" },
  { to: "/planning/dashboard", label: "Dashboard" },
];

function AuthenticatedPlanningLayout() {
  const { session, loading, configurationError, authError, signOut } = useAuth();
  const [signOutError, setSignOutError] = useState("");

  if (loading) {
    return <LoadingState label="Checking your sign-in..." />;
  }
  if (!session) {
    return (
      <div className="min-h-screen bg-page px-4 py-10 sm:px-6">
        <LoginPanel authError={authError} configurationError={configurationError} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-wide text-brand">
              A/L Study Hub
            </p>
            <h1 className="mt-1 text-xl font-bold text-ink">
              Adaptive study planning
            </h1>
          </div>
          <nav
            aria-label="Planning"
            className="flex flex-wrap gap-2 sm:gap-3"
          >
            {navigation.map(({ to, label }) => (
              <NavLink
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-semibold ${
                    isActive
                      ? "bg-brand text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-ink"
                  }`
                }
                key={to}
                to={to}
              >
                {label}
              </NavLink>
            ))}
            <button
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-ink"
              onClick={() => {
                setSignOutError("");
                void signOut().catch((cause: unknown) =>
                  setSignOutError(
                    cause instanceof Error
                      ? cause.message
                      : "Could not sign out.",
                  ),
                );
              }}
              type="button"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
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
