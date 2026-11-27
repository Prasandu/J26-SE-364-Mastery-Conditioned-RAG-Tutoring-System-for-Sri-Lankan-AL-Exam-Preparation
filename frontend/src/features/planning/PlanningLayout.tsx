import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import LoginPanel from "../../auth/LoginPanel";
import LoadingState from "../../components/LoadingState";
import NotificationBell from "./NotificationBell";

// Component 3 - Adaptive Study Planning (planning-service). Rendered inside the
// integrated app's Layout, so the site header, account menu and sign-out come
// from there; this adds the planning sub-navigation and the notification bell.
const navigation = [
  { to: "/planning/dashboard", label: "Dashboard" },
  { to: "/planning/plan", label: "Study plan" },
  { to: "/planning/setup", label: "Set up" },
];

export default function PlanningLayout() {
  const { session, loading, configurationError, authError } = useAuth();

  if (loading) {
    return <LoadingState label="Checking your sign-in..." />;
  }
  if (!session) {
    return (
      <div className="bg-page">
        <LoginPanel authError={authError} configurationError={configurationError} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[1.75rem] border border-slate-100 bg-white/95 px-4 py-2.5 shadow-card">
        <p className="text-base font-semibold text-ink">
          Study planner{" "}
          <span className="text-sm font-normal text-slate-500">adaptive plan from your mastery</span>
        </p>
        <nav aria-label="Planning" className="flex flex-wrap gap-1">
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
        <NotificationBell />
      </div>
      <Outlet />
    </div>
  );
}
