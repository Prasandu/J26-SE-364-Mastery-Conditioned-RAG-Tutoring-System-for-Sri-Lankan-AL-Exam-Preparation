import { Route, Routes } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";

import { AdminDashboard } from "./AdminDashboard";
import { AdminLayout } from "./AdminLayout";
import { GeneratePage } from "../generate/GeneratePage";
import { ImportPage } from "./ImportPage";
import { PaperDetailPage } from "./PaperDetailPage";
import { PapersListPage } from "./PapersListPage";
import { PastPaperImportPage } from "./PastPaperImportPage";
import { ResourcesPage } from "./ResourcesPage";
import { SuggestionsPage } from "./SuggestionsPage";
import { UsersPage } from "./UsersPage";

/**
 * Content management: a workspace of its own (see AdminLayout), not a page inside
 * the student/teacher site. Gated by RequireAuth role="admin" in App.tsx.
 */
export function AdminPage() {
  const { logout } = useAuth();

  return (
    <AdminLayout onSignOut={logout}>
      <Routes>
        <Route index element={<AdminDashboard />} />
        <Route path="papers" element={<PapersListPage />} />
        <Route path="papers/:paperId" element={<PaperDetailPage />} />
        <Route path="suggestions" element={<SuggestionsPage />} />
        <Route path="resources" element={<ResourcesPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="past-papers" element={<PastPaperImportPage />} />
        <Route path="generate" element={<GeneratePage />} />
        <Route path="users" element={<UsersPage />} />
      </Routes>
    </AdminLayout>
  );
}
