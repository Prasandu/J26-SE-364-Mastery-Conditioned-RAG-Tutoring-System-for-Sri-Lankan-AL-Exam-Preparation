import { Navigate, Route, Routes } from "react-router-dom";

import { Layout } from "@/components/Layout";
import { AttemptPage } from "@/features/attempt/AttemptPage";
import { PaperDetail } from "@/features/papers/PaperDetail";
import { PaperList } from "@/features/papers/PaperList";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PaperList />} />
        <Route path="papers/:paperId" element={<PaperDetail />} />
        <Route path="attempts/:attemptId" element={<AttemptPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
