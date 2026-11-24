import { Navigate, Route, Routes } from "react-router-dom";

import { Layout } from "@/components/Layout";
import { RequireAuth } from "@/components/RequireAuth";
import { About } from "@/features/About";
import { AdminPage } from "@/features/admin/AdminPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { ProfilePage } from "@/features/auth/ProfilePage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { HistoryPage } from "@/features/history/HistoryPage";
import { HomePage } from "@/features/HomePage";
import { PracticePage } from "@/features/practice/PracticePage";
import { AttemptPage } from "@/features/attempt/AttemptPage";
import { PaperDetail } from "@/features/papers/PaperDetail";
import { PaperList } from "@/features/papers/PaperList";
import { ReviewPage } from "@/features/review/ReviewPage";

export function App() {
  return (
    <Routes>
      {/* The admin workspace is its own shell (see AdminLayout), not a page inside
          the student/teacher site - it is deliberately outside <Layout/>. */}
      <Route
        path="admin/*"
        element={
          <RequireAuth role="admin">
            <AdminPage />
          </RequireAuth>
        }
      />
      <Route path="generate" element={<Navigate to="/admin/generate" replace />} />

      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="papers" element={<PaperList />} />
        <Route path="papers/:paperId" element={<PaperDetail />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route
          path="profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route
          path="attempts/:attemptId"
          element={
            <RequireAuth role="student">
              <AttemptPage />
            </RequireAuth>
          }
        />
        <Route
          path="my-results"
          element={
            <RequireAuth role="student">
              <HistoryPage />
            </RequireAuth>
          }
        />
        <Route
          path="review"
          element={
            <RequireAuth role="teacher">
              <ReviewPage />
            </RequireAuth>
          }
        />
        <Route
          path="practice"
          element={
            <RequireAuth role="student">
              <PracticePage />
            </RequireAuth>
          }
        />
        <Route path="about" element={<About />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
