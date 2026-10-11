import { Link } from "react-router-dom";

export default function PapersPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="font-semibold text-brand">A/L Study Hub</p>
      <h1 className="mt-3 text-3xl font-bold">Exam preparation</h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        Browse examination papers, practise questions, and review submitted
        answers. Paper browsing will be connected when the API contract is
        available.
      </p>
      <nav aria-label="Study tools" className="mt-8 flex flex-wrap gap-4">
        <Link className="text-brand underline" to="/attempt">
          Start an attempt
        </Link>
        <Link className="text-brand underline" to="/review">
          Teacher review
        </Link>
      </nav>
    </main>
  );
}
