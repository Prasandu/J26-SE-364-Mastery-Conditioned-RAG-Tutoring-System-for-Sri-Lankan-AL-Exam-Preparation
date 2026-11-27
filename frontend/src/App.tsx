import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider as SupabaseSessionProvider } from "@/auth/AuthProvider";
import { Layout } from "@/components/Layout";
import LoadingState from "@/components/LoadingState";
import { RequireAuth } from "@/components/RequireAuth";
import { About } from "@/features/About";
import { AdminPage } from "@/features/admin/AdminPage";
import { AttemptPage } from "@/features/attempt/AttemptPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { ProfilePage } from "@/features/auth/ProfilePage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { HistoryPage } from "@/features/history/HistoryPage";
import { HomePage } from "@/features/HomePage";
import { LabPage } from "@/features/lab/LabPage";
import NotFoundPage from "@/features/NotFoundPage";
import { PaperDetail } from "@/features/papers/PaperDetail";
import { PaperList } from "@/features/papers/PaperList";
import PlanningLayout from "@/features/planning/PlanningLayout";
import PlanningPage from "@/features/planning/PlanPage";
import PlanningSetupPage from "@/features/planning/SetupPage";
import { PracticePage } from "@/features/practice/PracticePage";
import { ReviewPage } from "@/features/review/ReviewPage";
import { ConsultationPage } from "@/features/tutor/pages/ConsultationPage";
import { DashboardPage as TutorDashboardPage } from "@/features/tutor/pages/DashboardPage";
import { ProblemSolvingPage } from "@/features/tutor/pages/ProblemSolvingPage";
import { ProfilePage as TutorProfilePage } from "@/features/tutor/pages/ProfilePage";
import { ReportPage } from "@/features/tutor/pages/ReportPage";
import { TutorPage } from "@/features/tutor/pages/TutorPage";
import { WorkedExamplePage } from "@/features/tutor/pages/WorkedExamplePage";
import { TutorHome, TutorLayout } from "@/features/tutor/TutorLayout";
import { AuthProvider } from "@/hooks/useAuth";

const PlanningDashboardPage = lazy(() => import("@/features/planning/DashboardPage"));

function planningDashboard() {
  return (
    <Suspense fallback={<LoadingState label="Loading dashboard..." />}>
      <PlanningDashboardPage />
    </Suspense>
  );
}

/**
 * The integrated web app for all four components of J26-SE-364:
 *   /lab       - Virtual Chemistry Lab (component 1, apps/web)
 *   /papers... - Intelligent Assessment & Automated Evaluation (component 2)
 *   /planning  - Adaptive Study Planning (component 3)
 *   /tutor     - Cognitive Support & Tutoring (component 4)
 * One Supabase Auth sign-in is shared by all of them.
 */
export function App() {
  return (
    <SupabaseSessionProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </SupabaseSessionProvider>
  );
}

function AppRoutes() {
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
        <Route path="about" element={<About />} />

        {/* Component 1 - Virtual Chemistry Lab */}
        <Route path="lab" element={<LabPage />} />

        {/* Component 2 - Assessment */}
        <Route path="papers" element={<PaperList />} />
        <Route path="papers/:paperId" element={<PaperDetail />} />
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

        {/* Component 3 - Study planning */}
        <Route path="planning" element={<PlanningLayout />}>
          <Route index element={planningDashboard()} />
          <Route path="dashboard" element={planningDashboard()} />
          <Route path="setup" element={<PlanningSetupPage />} />
          <Route path="plan" element={<PlanningPage />} />
        </Route>

        {/* Component 4 - AI tutor */}
        <Route path="tutor" element={<TutorLayout />}>
          <Route index element={<TutorHome />} />
          <Route path="chat" element={<TutorPage />} />
          <Route path="practice" element={<ProblemSolvingPage />} />
          <Route path="worked-example" element={<WorkedExamplePage />} />
          <Route path="consultation" element={<ConsultationPage />} />
          <Route path="report" element={<ReportPage />} />
          <Route path="profile" element={<TutorProfilePage />} />
          <Route path="dashboard" element={<TutorDashboardPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
