import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import AttemptPage from "./features/attempt/AttemptPage";
import NotFoundPage from "./features/NotFoundPage";
import PapersPage from "./features/papers/PapersPage";
import PlanningLayout from "./features/planning/PlanningLayout";
import PlanningPage from "./features/planning/PlanPage";
import PlanningSetupPage from "./features/planning/SetupPage";
import ReviewPage from "./features/review/ReviewPage";
import LoadingState from "./components/LoadingState";

const PlanningDashboardPage = lazy(
  () => import("./features/planning/DashboardPage"),
);

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PapersPage />} />
      <Route path="/papers" element={<PapersPage />} />
      <Route path="/attempt" element={<AttemptPage />} />
      <Route path="/review" element={<ReviewPage />} />
      <Route path="/planning" element={<PlanningLayout />}>
        <Route
          index
          element={
            <Suspense fallback={<LoadingState label="Loading dashboard..." />}>
              <PlanningDashboardPage />
            </Suspense>
          }
        />
        <Route path="setup" element={<PlanningSetupPage />} />
        <Route path="plan" element={<PlanningPage />} />
        <Route
          path="dashboard"
          element={
            <Suspense fallback={<LoadingState label="Loading dashboard..." />}>
              <PlanningDashboardPage />
            </Suspense>
          }
        />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
