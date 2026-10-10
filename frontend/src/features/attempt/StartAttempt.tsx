import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { startAttempt } from "@/api/attempts";
import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { ErrorBox } from "@/components/ErrorBox";
import { readStudentRef, saveStudentRef } from "@/lib/student";

/** Asks who is answering, then creates the attempt and opens it. */
export function StartAttempt({ paperId }: { paperId: number }) {
  const navigate = useNavigate();
  const [studentRef, setStudentRef] = useState(readStudentRef);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = studentRef.trim();
    if (!trimmed) {
      setError("Type your student id first");
      return;
    }

    setStarting(true);
    setError(null);
    try {
      const attempt = await startAttempt(paperId, trimmed);
      saveStudentRef(trimmed);
      navigate(`/attempts/${attempt.id}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause));
      setStarting(false);
    }
  }

  return (
    <form onSubmit={start} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="student-ref" className="text-sm text-slate-600">
          Student id
        </label>
        <input
          id="student-ref"
          value={studentRef}
          onChange={(event) => setStudentRef(event.target.value)}
          maxLength={64}
          placeholder="e.g. S001"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
        />
        <Button type="submit" disabled={starting}>
          {starting ? "Starting..." : "Start attempt"}
        </Button>
      </div>
      {error && <ErrorBox message={error} />}
    </form>
  );
}
