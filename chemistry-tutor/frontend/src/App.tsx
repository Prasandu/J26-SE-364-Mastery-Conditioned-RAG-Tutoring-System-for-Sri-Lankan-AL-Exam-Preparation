import { useState } from "react";
import { Footer } from "./components/layout/Footer";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AuthPage } from "./pages/AuthPage";
import { ConsultationPage } from "./pages/ConsultationPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HomePage } from "./pages/HomePage";
import { ProblemSolvingPage } from "./pages/ProblemSolvingPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ReportPage } from "./pages/ReportPage";
import { TutorPage } from "./pages/TutorPage";

type Tab = "home" | "chat" | "practice" | "dashboard" | "consultation" | "report" | "profile";

function AuthenticatedApp() {
  const [tab, setTab] = useState<Tab>("home");
  const { user, signOut } = useAuth();

  // Dashboard tab hidden for now per request — code/route stays reachable
  // in state, just not shown in the nav, same pattern as Practice Questions.
  const tabs: { key: Tab; label: string }[] = [
    { key: "home", label: "Home" },
    { key: "chat", label: "Chat" },
    { key: "practice", label: "Practice" },
    { key: "consultation", label: "Consultation" },
    { key: "report", label: "Report" },
  ];

  return (
    <div className="flex h-screen flex-col">
      <nav className="flex items-center gap-1 border-b bg-blue-950 px-3 py-2 print:hidden">
        <span className="mr-2 text-sm font-semibold text-white">RAG Tutor</span>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded px-3 py-1 text-sm ${
              tab === t.key ? "bg-blue-800 text-white" : "text-blue-200"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setTab("profile")}
            className={`rounded px-3 py-1 text-sm ${
              tab === "profile" ? "bg-blue-800 text-white" : "text-blue-200"
            }`}
          >
            {user?.email}
          </button>
          <button onClick={signOut} className="rounded px-2 py-1 text-xs text-blue-200 hover:text-white">
            Sign out
          </button>
        </div>
      </nav>
      <div className="flex-1 overflow-hidden">
        {tab === "home" && <HomePage onNavigate={setTab} />}
        {tab === "chat" && <TutorPage />}
        {tab === "practice" && <ProblemSolvingPage />}
        {tab === "dashboard" && <DashboardPage />}
        {tab === "consultation" && <ConsultationPage />}
        {tab === "report" && <ReportPage />}
        {tab === "profile" && <ProfilePage />}
      </div>
      <Footer />
    </div>
  );
}

function AppShell() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-400">
        Loading...
      </div>
    );
  }

  return user ? <AuthenticatedApp /> : <AuthPage />;
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;
