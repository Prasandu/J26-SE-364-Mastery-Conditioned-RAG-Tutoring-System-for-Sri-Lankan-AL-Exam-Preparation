import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { startAttempt } from "@/api/attempts";
import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { ErrorBox } from "@/components/ErrorBox";
import { useAuth } from "@/hooks/useAuth";

/** Starts the attempt as the signed-in student, or asks them to sign in first. */
export function StartAttempt({ paperId }: { readonly paperId: number }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  if (!user) {
    return (
      <Link
        to={`/login?next=${encodeURIComponent(`/papers/${paperId}`)}`}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-600/25 hover:bg-brand-700"
      >
        Sign in to start this attempt
      </Link>
    );
  }

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const attempt = await startAttempt(paperId);
      navigate(`/attempts/${attempt.id}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause));
      setStarting(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={() => void start()} disabled={starting}>
        {starting ? "Starting..." : "Start this attempt"}
      </Button>
      {error && <ErrorBox message={error} />}
    </div>
  );
}
