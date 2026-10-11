import { useCallback } from "react";
import { Link } from "react-router-dom";

import { myPapers } from "@/api/practice";
import type { PaperSummary } from "@/api/types";
import { Badge } from "@/components/Badge";
import { EmptyState, ErrorBox } from "@/components/ErrorBox";
import { GlassOrb } from "@/components/GlassOrb";
import { Hero, SectionTitle } from "@/components/Hero";
import { CardSkeleton } from "@/components/Spinner";
import { useApi } from "@/hooks/useApi";
import { readStudentRef } from "@/lib/student";
import { paperSubtitle } from "@/lib/format";

import { HowItWorks } from "./HowItWorks";

export function PaperList() {
  // A student's own practice papers only appear for them.
  const studentRef = readStudentRef();
  const load = useCallback((signal: AbortSignal) => myPapers(studentRef, signal), [studentRef]);
  const { data: papers, error, loading } = useApi(load, [studentRef]);

  return (
    <div className="space-y-14">
      <Hero
        eyebrow="A/L Chemistry"
        title="Practise a past paper and get it marked"
        aside={<MarkedExample />}
      >
        <p>
          Answer on screen, or photograph your written answers and your MCQ sheet. Every mark comes
          with the reason behind it, and anything the system is unsure about goes to a teacher.
        </p>
      </Hero>

      <HowItWorks />

      <section>
        <SectionTitle lead={papers ? `${papers.length} published` : undefined}>
          Choose a paper
        </SectionTitle>

        {loading && <CardSkeleton />}

        {error && (
          <ErrorBox
            message={error}
            hint="Start the service with: uvicorn app.main:app --reload --port 8001"
          />
        )}

        {papers?.length === 0 && (
          <EmptyState title="No published papers yet">
            Publish a paper from the admin API, then refresh this page.
          </EmptyState>
        )}

        {papers && papers.length > 0 && (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {papers.map((paper) => (
              <li key={paper.id}>
                <PaperCard paper={paper} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PaperCard({ paper }: { paper: PaperSummary }) {
  return (
    <Link to={`/papers/${paper.id}`} className="group block h-full">
      <article className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/75 shadow-lg shadow-brand-900/5 backdrop-blur-xl transition group-hover:-translate-y-1.5 group-hover:bg-white group-hover:shadow-xl group-hover:shadow-brand-900/10">
        <div className="h-1.5 bg-linear-to-r from-brand-600 via-brand-400 to-brand-200" />

        <div className="flex flex-1 flex-col p-6">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-medium leading-snug text-slate-900">{paper.title}</h3>
            <Badge tone={paper.kind === "past" ? "neutral" : "good"}>
              {paper.kind === "model" ? "practice" : paper.kind}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-slate-500">{paperSubtitle(paper)}</p>

          <span className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-50 px-4 py-2 pt-2 text-sm font-medium text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
            Open paper
            <span aria-hidden="true" className="transition group-hover:translate-x-0.5">
              &rarr;
            </span>
          </span>
        </div>
      </article>
    </Link>
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

function Point({ ok, label, by }: { ok: boolean; label: string; by: string }) {
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
