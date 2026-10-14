import { useCallback } from "react";
import { Link } from "react-router-dom";

import { myAttempts } from "@/api/attempts";
import { myPapers } from "@/api/practice";
import type { Attempt, PaperSummary } from "@/api/types";
import { Card } from "@/components/Card";
import { EmptyState, ErrorBox } from "@/components/ErrorBox";
import { Hero } from "@/components/Hero";
import { Spinner } from "@/components/Spinner";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/hooks/useAuth";

import { AttemptRow } from "./AttemptRow";

/** Every paper the signed-in student has attempted, newest first, with what it scored.
 *
 * Gated by RequireAuth(role="student") in App.tsx, so a user is always signed in here.
 */
export function HistoryPage() {
  const { user } = useAuth();

  const load = useCallback(async (signal: AbortSignal) => {
    // An attempt carries a paper id, not a title, so the paper list supplies the names.
    const [attempts, papers] = await Promise.all([myAttempts(signal), myPapers(signal)]);
    return { attempts, papers };
  }, []);

  const { data, error, loading } = useApi(load, []);

  return (
    <div className="space-y-8">
      <Header email={user?.email} />

      {loading && <Spinner label="Loading your attempts..." />}
      {error && <ErrorBox message={error} />}

      {data?.attempts.length === 0 && (
        <EmptyState title="You have not attempted a paper yet">
          <Link to="/papers" className="text-brand-700 underline">
            Choose a paper
          </Link>{" "}
          to make a start.
        </EmptyState>
      )}

      {data && data.attempts.length > 0 && (
        <Card>
          <ol className="divide-y divide-slate-100">
            {data.attempts.map((attempt) => (
              <li key={attempt.id} className="py-3 first:pt-0 last:pb-0">
                <AttemptRow attempt={attempt} title={titleOf(attempt, data.papers)} />
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

function Header({ email }: { readonly email?: string }) {
  return (
    <Hero eyebrow="My results" title="Everything you have attempted">
      <p>
        Open any attempt to see the marks point by point, including anything a teacher checked by
        hand.
        {email && (
          <>
            {" "}
            Signed in as <strong>{email}</strong>.
          </>
        )}
      </p>
    </Hero>
  );
}

function titleOf(attempt: Attempt, papers: PaperSummary[]): string {
  const paper = papers.find((other) => other.id === attempt.paper_id);
  return paper ? paper.title : `Paper ${attempt.paper_id}`;
}
