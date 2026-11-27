import { Link, Navigate } from "react-router-dom";

import { Button } from "@/components/Button";
import { GlassOrb } from "@/components/GlassOrb";
import { Hero, SectionTitle } from "@/components/Hero";
import { useAuth } from "@/hooks/useAuth";

import { HowItWorks } from "./papers/HowItWorks";

/** The welcome screen at "/" - not the papers list, which lives at /papers. */
export function HomePage() {
  const { user } = useAuth();

  // An admin has no use for the student/teacher landing page - straight to their
  // own workspace, however they got to "/" (not just right after logging in).
  if (user?.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="space-y-14">
      <Hero
        eyebrow="A/L Chemistry"
        title="Practise a past paper and get it marked"
        aside={<MarkedExample />}
        actions={
          <>
            <Link to="/papers">
              <Button>Browse papers</Button>
            </Link>
            <Link to="/practice">
              <Button variant="secondary">Make a practice paper</Button>
            </Link>
            {!user && (
              <Link to="/register">
                <Button variant="ghost">Create a free account</Button>
              </Link>
            )}
          </>
        }
      >
        <p>
          Answer on screen, or photograph your written answers and your MCQ sheet. Every mark comes
          with the reason behind it, and anything the system is unsure about goes to a teacher.
        </p>
      </Hero>

      <Components />

      <HowItWorks />
    </div>
  );
}

// The four components of J26-SE-364, one sign-in for all of them.
const COMPONENTS = [
  {
    to: "/lab",
    title: "Virtual Chemistry Lab",
    text: "Practise NIE handbook practicals step by step in a 3D lab, in English or Sinhala.",
  },
  {
    to: "/papers",
    title: "Past papers & marking",
    text: "Answer real past papers and get every mark explained, point by point.",
  },
  {
    to: "/planning",
    title: "Study plan",
    text: "A weekly plan built from what you have mastered and what the exam weighs most.",
  },
  {
    to: "/tutor",
    title: "AI tutor",
    text: "Ask questions, get hints and review your mistakes with a bilingual Chemistry tutor.",
  },
];

function Components() {
  return (
    <section aria-labelledby="components-title">
      <SectionTitle lead="One account works across all four parts.">
        <span id="components-title">Everything in one place</span>
      </SectionTitle>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {COMPONENTS.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className="block h-full rounded-3xl border border-white/70 bg-white/80 p-5 shadow-lg shadow-brand-900/5 transition hover:-translate-y-0.5 hover:shadow-xl"
            >
              <h3 className="font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-1.5 text-sm text-slate-600">{item.text}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A taste of what marking looks like, floating beside the glass. */
function MarkedExample() {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <GlassOrb className="mx-auto w-full max-w-[22rem]" />

      <div className="absolute -bottom-2 left-0 right-0 rounded-2xl border border-white/80 bg-white/85 p-4 shadow-xl shadow-brand-900/10 backdrop-blur-xl sm:left-4 sm:right-4">
        <p className="font-mono text-xs text-slate-500">1(b) concentration of NaOH</p>
        <ul className="mt-2.5 space-y-1.5 text-xs">
          <Point ok label="Moles of HCl" by="checker" />
          <Point ok={false} label="Mole ratio stated" by="AI judge" />
          <Point ok label="Unit correct" by="checker" />
        </ul>
      </div>
    </div>
  );
}

function Point({ ok, label, by }: { readonly ok: boolean; readonly label: string; readonly by: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          ok ? "bg-brand-100 text-brand-700" : "bg-rose-100 text-rose-700"
        }`}
        aria-hidden="true"
      >
        {ok ? "✓" : "✕"}
      </span>
      <span className="text-slate-700">{label}</span>
      <span className="ml-auto text-slate-400">{by}</span>
    </li>
  );
}
