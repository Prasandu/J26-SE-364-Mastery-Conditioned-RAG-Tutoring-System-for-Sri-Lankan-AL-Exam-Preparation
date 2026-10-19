import { useState } from "react";
import { ConsultationPage } from "./pages/ConsultationPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProblemSolvingPage } from "./pages/ProblemSolvingPage";
import { ReportPage } from "./pages/ReportPage";
import { TutorPage } from "./pages/TutorPage";

type Tab = "chat" | "practice" | "dashboard" | "consultation" | "report";

function App() {
  const [tab, setTab] = useState<Tab>("chat");

  const tabs: { key: Tab; label: string }[] = [
    { key: "chat", label: "Chat" },
    { key: "practice", label: "Practice" },
    { key: "dashboard", label: "Dashboard" },
    { key: "consultation", label: "Consultation" },
    { key: "report", label: "Report" },
  ];

  return (
    <div className="flex h-screen flex-col">
      <nav className="flex gap-1 border-b bg-gray-900 px-3 py-2 print:hidden">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded px-3 py-1 text-sm ${
              tab === t.key ? "bg-gray-700 text-white" : "text-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-hidden">
        {tab === "chat" && <TutorPage />}
        {tab === "practice" && <ProblemSolvingPage />}
        {tab === "dashboard" && <DashboardPage />}
        {tab === "consultation" && <ConsultationPage />}
        {tab === "report" && <ReportPage />}
      </div>
    </div>
  );
}

export default App;
