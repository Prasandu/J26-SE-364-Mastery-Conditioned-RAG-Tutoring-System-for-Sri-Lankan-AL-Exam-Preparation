import { useCallback } from "react";
import { Link } from "react-router-dom";

import { myPapers } from "@/api/practice";
import type { PaperSummary } from "@/api/types";
import { Badge } from "@/components/Badge";
import { EmptyState, ErrorBox } from "@/components/ErrorBox";
import { Hero, SectionTitle } from "@/components/Hero";
import { CardSkeleton } from "@/components/Spinner";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/hooks/useAuth";
import { paperSubtitle } from "@/lib/format";

/** The published papers, plus a signed-in student's own practice papers. */
export function PaperList() {
  // A signed-in student's own practice papers appear alongside the shared ones -
  // the request's Authorization token decides that, see api/practice.ts.
  const { user } = useAuth();
  const load = useCallback((signal: AbortSignal) => myPapers(signal), []);
  // [user]: reload when login state changes, even though load() itself does not
  // reference user directly - the token it sends comes from storage, not a prop.
  const { data: papers, error, loading } = useApi(load, [user]);

  return (
    <div className="space-y-8">
      <Hero eyebrow="Papers" title="Choose a paper">
        <p>Answer on screen, or photograph your written answers and your MCQ sheet.</p>
      </Hero>

      <section>
        <SectionTitle lead={papers ? `${papers.length} published` : undefined}>
          Available papers
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

function PaperCard({ paper }: { readonly paper: PaperSummary }) {
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
