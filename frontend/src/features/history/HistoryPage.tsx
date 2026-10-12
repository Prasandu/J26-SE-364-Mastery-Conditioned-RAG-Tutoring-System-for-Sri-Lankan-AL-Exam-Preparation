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
import { readStudentRef } from "@/lib/student";

import { AttemptRow } from "./AttemptRow";

/** Every paper this student has attempted, newest first, with what it scored. */
export function HistoryPage() {
  const studentRef = readStudentRef();

  const load = useCallback(
    async (signal: AbortSignal) => {
      // An attempt carries a paper id, not a title, so the paper list supplies the names.
      const [attempts, papers] = await Promise.all([
        myAttempts(studentRef, signal),
        myPapers(studentRef, signal),
      ]);
      return { attempts, papers };
    },
    [studentRef],
  );

  const { data, error, loading } = useApi(load, [studentRef]);

  if (studentRef === "") {
    return (
      <div className="space-y-8">
        <Header />
        <EmptyState title="No student number on this device yet">
          Open a paper and start an attempt. Your results then collect here.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Header studentRef={studentRef} />

      {loading && <Spinner label="Loading your attempts..." />}
      {error && <ErrorBox message={error} />}

      {data?.attempts.length === 0 && (
        <EmptyState title="You have not attempted a paper yet">
          <Link to="/" className="text-brand-700 underline">
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

function Header({ studentRef }: { studentRef?: string }) {
  return (
    <Hero eyebrow="My results" title="Everything you have attempted">
      <p>
        Open any attempt to see the marks point by point, including anything a teacher checked by
        hand.
        {studentRef && (
          <>
            {" "}
            These are the attempts saved under <strong>{studentRef}</strong>.
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
