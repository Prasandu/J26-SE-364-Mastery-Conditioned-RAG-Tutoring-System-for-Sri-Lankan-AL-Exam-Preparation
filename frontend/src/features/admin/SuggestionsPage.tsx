import { useCallback, useState } from "react";

import {
  approveSuggestion,
  classifyTopics,
  listTopicSuggestions,
  rejectSuggestion,
} from "@/api/admin";
import { ApiError } from "@/api/client";
import type { TopicSuggestion } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, SectionHeading } from "@/components/Card";
import { EmptyState, ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { useApi } from "@/hooks/useApi";
import { readAdminRef, saveAdminRef } from "@/lib/teacher";

/**
 * AI-suggested topic tags, waiting for a person to decide.
 *
 * A suggestion is never applied on its own - approving writes the topics onto the
 * question, rejecting leaves it exactly as it was. Nothing here is treated as ground
 * truth until a named person says so.
 */
export function SuggestionsPage() {
  const load = useCallback((signal: AbortSignal) => listTopicSuggestions("pending", signal), []);
  const { data: suggestions, error, loading, reload } = useApi(load, []);

  const [classifying, setClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);

  async function runClassifier() {
    setClassifying(true);
    setClassifyError(null);
    try {
      const created = await classifyTopics();
      reload();
      if (created.length === 0) {
        setClassifyError(
          "Nothing to classify: every question already has a topic or a pending suggestion.",
        );
      }
    } catch (cause) {
      setClassifyError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setClassifying(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Topic suggestions</h1>
          <p className="mt-1 text-sm text-slate-500">
            {suggestions ? `${suggestions.length} waiting for review` : "Loading..."}
          </p>
        </div>
        <Button disabled={classifying} onClick={() => void runClassifier()}>
          {classifying ? "Asking the model..." : "Classify untagged questions"}
        </Button>
      </div>

      {classifyError && <ErrorBox message={classifyError} />}
      {error && <ErrorBox message={error} />}
      {loading && <Spinner label="Loading suggestions..." />}

      {suggestions?.length === 0 && (
        <EmptyState title="Nothing waiting for review">
          Click "Classify untagged questions" to ask the model for suggestions.
        </EmptyState>
      )}

      {suggestions && suggestions.length > 0 && (
        <ol className="space-y-4">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <SuggestionCard suggestion={suggestion} onDecided={reload} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onDecided,
}: {
  suggestion: TopicSuggestion;
  onDecided: () => void;
}) {
  const [kept, setKept] = useState<Set<string>>(new Set(suggestion.suggested_codes));
  const [name, setName] = useState(readAdminRef());
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(code: string) {
    setKept((current) => {
      const next = new Set(current);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }

  async function decide(action: "approve" | "reject") {
    setBusy(action);
    setError(null);
    try {
      saveAdminRef(name.trim());
      if (action === "approve") {
        await approveSuggestion(suggestion.id, name.trim(), [...kept]);
      } else {
        await rejectSuggestion(suggestion.id, name.trim());
      }
      onDecided();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <SectionHeading hint={`question ${suggestion.question_id}`}>
        {suggestion.confidence !== null && (
          <span className="text-sm font-normal text-slate-500">
            {Math.round(suggestion.confidence * 100)}% sure
          </span>
        )}
      </SectionHeading>

      <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
        {suggestion.question_text}
      </p>

      {suggestion.reason && <p className="mt-2 text-sm text-slate-500">{suggestion.reason}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {suggestion.suggested_codes.map((code) => (
          <label key={code} className="cursor-pointer">
            <input
              type="checkbox"
              checked={kept.has(code)}
              onChange={() => toggle(code)}
              className="sr-only"
            />
            <Badge tone={kept.has(code) ? "good" : "neutral"}>{code}</Badge>
          </label>
        ))}
      </div>

      {error && (
        <div className="mt-3">
          <ErrorBox message={error} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          aria-label="Decided by"
          className="w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
        />
        <Button disabled={busy !== null || !name.trim()} onClick={() => void decide("approve")}>
          {busy === "approve" ? "Approving..." : `Approve (${kept.size})`}
        </Button>
        <Button
          variant="secondary"
          disabled={busy !== null || !name.trim()}
          onClick={() => void decide("reject")}
        >
          {busy === "reject" ? "Rejecting..." : "Reject"}
        </Button>
      </div>
    </Card>
  );
}
