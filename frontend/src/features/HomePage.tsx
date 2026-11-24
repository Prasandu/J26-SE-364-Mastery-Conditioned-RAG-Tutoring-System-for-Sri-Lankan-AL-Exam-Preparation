import { Link, Navigate } from "react-router-dom";

import { Button } from "@/components/Button";
import { GlassOrb } from "@/components/GlassOrb";
import { Hero } from "@/components/Hero";
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

      <HowItWorks />
    </div>
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
