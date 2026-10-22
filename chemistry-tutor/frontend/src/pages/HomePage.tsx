import { useAuth } from "../contexts/AuthContext";

interface HomePageProps {
  onNavigate: (tab: "chat" | "practice" | "dashboard") => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { user } = useAuth();

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <section className="bg-blue-950 px-6 py-16 text-center text-white">
        <p className="text-xs font-semibold tracking-widest text-blue-300 uppercase">
          G.C.E. Advanced Level Chemistry
        </p>
        <h1 className="mx-auto mt-3 max-w-3xl text-3xl font-bold sm:text-4xl">
          Mastery-Conditioned RAG Tutoring System
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-blue-100 sm:text-base">
          A bilingual AI Chemistry tutor for Sri Lankan A/L students — grounded answers with
          citations, step-by-step hints, and a Practice flow built around the questions you
          actually got wrong.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <button
            onClick={() => onNavigate("chat")}
            className="rounded bg-white px-5 py-2 text-sm font-medium text-blue-950 hover:bg-blue-100"
          >
            Start Chatting
          </button>
          <button
            onClick={() => onNavigate("practice")}
            className="rounded border border-blue-300 px-5 py-2 text-sm font-medium text-white hover:bg-blue-900"
          >
            Review Mistakes
          </button>
        </div>
        {user && <p className="mt-6 text-xs text-blue-300">Welcome back, {user.email}</p>}
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12">
        <div className="grid gap-4 sm:grid-cols-3">
          <FeatureCard
            title="Grounded Chat"
            description="Ask a question in English or Sinhala and get an answer sourced from the official NIE syllabus and resource book, with citations."
          />
          <FeatureCard
            title="Review Mistakes"
            description="Questions you got wrong are walked through step by step with a progressive hint ladder, not just handed the answer."
          />
          <FeatureCard
            title="Progress & Reports"
            description="Track independent vs. assisted mastery, get a personalised consultation, and generate a Wivarana report."
          />
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <h2 className="text-sm font-semibold text-blue-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
    </div>
  );
}
