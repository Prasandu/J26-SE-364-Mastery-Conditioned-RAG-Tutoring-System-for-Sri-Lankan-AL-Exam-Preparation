import { useState } from "react";

import { approveSuggestion, classifyTopics, listTopicSuggestions, rejectSuggestion, setQuestionTopics } from "@/api/admin";
import { ApiError } from "@/api/client";
import type { Topic, TopicSuggestion } from "@/api/types";
import { Badge } from "@/components/Badge";
import { readAdminRef, saveAdminRef } from "@/lib/teacher";

interface Props {
  questionId: number;
  topics: string[]; // current topic codes
  allTopics: Topic[];
  onChanged: (codes: string[]) => void;
}

/** Add or remove one question's syllabus topic tags. Works on a paper of any status. */
export function TopicTagEditor({ questionId, topics, allTopics, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<TopicSuggestion | null>(null);

  const available = allTopics.filter((topic) => !topics.includes(topic.code));

  async function save(next: string[]) {
    setBusy(true);
    setError(null);
    try {
      await setQuestionTopics(questionId, next);
      onChanged(next);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function suggest() {
    setSuggesting(true);
    setError(null);
    try {
      // A pending suggestion from an earlier run (e.g. the Topic suggestions page's
      // batch job) is reused instead of asking the model again - saves a call out
      // of the shared AI quota, and classify_questions would just skip it anyway.
      const existing = await listTopicSuggestions("pending", undefined, questionId);
      if (existing.length > 0) {
        setSuggestion(existing[0]);
        return;
      }
      const created = await classifyTopics([questionId]);
      if (created.length === 0) {
        setError("The model had nothing new to suggest for this question.");
        return;
      }
      setSuggestion(created[0]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setSuggesting(false);
    }
  }

  async function decide(action: "approve" | "reject") {
    if (!suggestion) return;
    setBusy(true);
    setError(null);
    try {
      const by = readAdminRef().trim() || "admin";
      saveAdminRef(by);
      if (action === "approve") {
        const codes = [...new Set([...topics, ...suggestion.suggested_codes])];
        await approveSuggestion(suggestion.id, by, suggestion.suggested_codes);
        onChanged(codes);
      } else {
        await rejectSuggestion(suggestion.id, by);
      }
      setSuggestion(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {topics.map((code) => (
        <button
          key={code}
          type="button"
          disabled={busy}
          onClick={() => void save(topics.filter((other) => other !== code))}
          className="group"
          aria-label={`Remove topic ${code}`}
        >
          <Badge tone="good">
            {code}
            <span className="ml-1 text-brand-400 group-hover:text-brand-700">&times;</span>
          </Badge>
        </button>
      ))}

      {available.length > 0 && !suggestion && (
        <select
          disabled={busy}
          value=""
          aria-label={`Add a topic to question ${questionId}`}
          onChange={(event) => {
            if (event.target.value) {
              void save([...topics, event.target.value]);
            }
          }}
          className="rounded-full border border-dashed border-slate-300 bg-white/60 px-2 py-0.5 text-xs text-slate-500 focus:border-brand-500 focus:outline-none"
        >
          <option value="">+ add topic</option>
          {available.map((topic) => (
            <option key={topic.code} value={topic.code}>
              {topic.code} — {topic.name}
            </option>
          ))}
        </select>
      )}

      {!suggestion && (
        <button
          type="button"
          disabled={suggesting || busy}
          onClick={() => void suggest()}
          className="rounded-full border border-dashed border-brand-300 bg-brand-50/60 px-2 py-0.5 text-xs text-brand-600 hover:bg-brand-50 disabled:opacity-50"
        >
          {suggesting ? "Asking the model..." : "✨ Suggest"}
        </button>
      )}

      {suggestion && (
        <span className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-dashed border-brand-300 bg-brand-50/60 px-2 py-0.5 text-xs text-brand-700">
          Suggested: {suggestion.suggested_codes.join(", ") || "(nothing)"}
          {suggestion.confidence !== null && ` (${Math.round(suggestion.confidence * 100)}% sure)`}
          <button
            type="button"
            disabled={busy || suggestion.suggested_codes.length === 0}
            onClick={() => void decide("approve")}
            className="font-medium text-brand-700 underline hover:text-brand-900 disabled:opacity-50"
          >
            Apply
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide("reject")}
            className="text-slate-500 underline hover:text-slate-700"
          >
            Dismiss
          </button>
        </span>
      )}

      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
