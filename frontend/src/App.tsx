import { Route, Routes } from "react-router-dom";
import AttemptPage from "./features/attempt/AttemptPage";
import NotFoundPage from "./features/NotFoundPage";
import PapersPage from "./features/papers/PapersPage";
import ReviewPage from "./features/review/ReviewPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PapersPage />} />
      <Route path="/papers" element={<PapersPage />} />
      <Route path="/attempt" element={<AttemptPage />} />
      <Route path="/review" element={<ReviewPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
