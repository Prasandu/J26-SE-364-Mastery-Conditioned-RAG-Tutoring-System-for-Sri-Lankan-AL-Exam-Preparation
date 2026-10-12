import { Navigate, Route, Routes } from "react-router-dom";

import { Layout } from "@/components/Layout";
import { About } from "@/features/About";
import { AdminPage } from "@/features/admin/AdminPage";
import { GeneratePage } from "@/features/generate/GeneratePage";
import { HistoryPage } from "@/features/history/HistoryPage";
import { PracticePage } from "@/features/practice/PracticePage";
import { AttemptPage } from "@/features/attempt/AttemptPage";
import { PaperDetail } from "@/features/papers/PaperDetail";
import { PaperList } from "@/features/papers/PaperList";
import { ReviewPage } from "@/features/review/ReviewPage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PaperList />} />
        <Route path="papers/:paperId" element={<PaperDetail />} />
        <Route path="attempts/:attemptId" element={<AttemptPage />} />
        <Route path="my-results" element={<HistoryPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="practice" element={<PracticePage />} />
        <Route path="generate" element={<GeneratePage />} />
        <Route path="admin/*" element={<AdminPage />} />
        <Route path="about" element={<About />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
