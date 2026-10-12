import { useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";

import { Button } from "@/components/Button";
import { readAdminKey, saveAdminKey } from "@/lib/teacher";

import { AdminSignIn } from "./AdminSignIn";
import { PaperDetailPage } from "./PaperDetailPage";
import { PapersListPage } from "./PapersListPage";
import { SuggestionsPage } from "./SuggestionsPage";

const TABS = [
  { to: "/admin/papers", label: "Papers", end: false },
  { to: "/admin/suggestions", label: "Topic suggestions", end: false },
];

/** Content management: browse and search papers, manage marking schemes, tag
 * topics, review AI topic suggestions. Everything here needs the admin key. */
export function AdminPage() {
  const [signedIn, setSignedIn] = useState(() => readAdminKey() !== "");

  if (!signedIn) {
    return <AdminSignIn onReady={() => setSignedIn(true)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-2" aria-label="Admin sections">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `rounded-full px-4 py-2 text-sm transition ${
                  isActive
                    ? "bg-brand-600 font-medium text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <Button
          variant="secondary"
          onClick={() => {
            saveAdminKey("");
            setSignedIn(false);
          }}
        >
          Sign out
        </Button>
      </div>

      <Routes>
        <Route index element={<PapersListPage />} />
        <Route path="papers" element={<PapersListPage />} />
        <Route path="papers/:paperId" element={<PaperDetailPage />} />
        <Route path="suggestions" element={<SuggestionsPage />} />
      </Routes>
    </div>
  );
}
