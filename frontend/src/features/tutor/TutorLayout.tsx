import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import LoginPanel from "@/auth/LoginPanel";
import LoadingState from "@/components/LoadingState";

import { HomePage } from "./pages/HomePage";
import "./tutor.css";

// Component 4 - Cognitive Support & Tutoring (chemistry-tutor/support-service).
// The Dashboard page stays reachable at /tutor/dashboard but, as in the original
// tutor app, is not shown in the tabs.
const tabs = [
  { to: "/tutor", label: "Home", end: true },
  { to: "/tutor/chat", label: "Chat", end: false },
  { to: "/tutor/practice", label: "Practice", end: false },
  { to: "/tutor/worked-example", label: "Worked steps", end: false },
  { to: "/tutor/consultation", label: "Consultation", end: false },
  { to: "/tutor/report", label: "Report", end: false },
  { to: "/tutor/profile", label: "Profile", end: false },
];

export function TutorLayout() {
  const { session, loading, authError, configurationError } = useAuth();

  if (loading) {
    return <LoadingState label="Checking your sign-in..." />;
  }
  if (!session) {
    return <LoginPanel authError={authError} configurationError={configurationError} />;
  }

  return (
    <section aria-label="AI tutor" className="flex flex-col gap-3">
      <nav
        aria-label="AI tutor"
        className="flex flex-wrap items-center gap-1 rounded-2xl bg-blue-950 px-3 py-2 print:hidden"
      >
        <span className="mr-2 text-sm font-semibold text-white">AI Tutor</span>
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `rounded px-3 py-1 text-sm ${isActive ? "bg-blue-800 text-white" : "text-blue-200 hover:text-white"}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      {/* The tutor pages were built to fill a screen (h-full + their own scrolling),
          so they get a fixed-height panel here rather than the page's flow. */}
      <div className="h-[calc(100vh-13rem)] min-h-[34rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:h-auto print:overflow-visible">
        <Outlet />
      </div>
    </section>
  );
}

export function TutorHome() {
  const navigate = useNavigate();
  return <HomePage onNavigate={(tab) => navigate(`/tutor/${tab}`)} />;
}
