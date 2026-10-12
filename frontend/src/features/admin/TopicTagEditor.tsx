import { useState } from "react";

import { setQuestionTopics } from "@/api/admin";
import { ApiError } from "@/api/client";
import type { Topic } from "@/api/types";
import { Badge } from "@/components/Badge";

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

      {available.length > 0 && (
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

      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
