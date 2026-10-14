import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, request } from "@/api/client";
import { makePractice, practiceLimits, practiceRates } from "@/api/practice";
import type { Counts, Topic } from "@/api/types";
import { Button } from "@/components/Button";
import { Card, SectionHeading } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import type { Step } from "@/components/Steps";
import { Steps } from "@/components/Steps";
import { useApi } from "@/hooks/useApi";
import { spell, useElapsed } from "@/hooks/useElapsed";
import { shapeFrom } from "@/lib/shape";

import { PaperShape } from "../generate/PaperShape";
import { TopicWizard } from "./TopicWizard";

const NO_COUNTS: Counts = { mcq: 0, structured: 0, essay: 0 };

const topicList = (signal: AbortSignal) => request<Topic[]>("/papers/practice/topics", { signal });

/**
 * A student making a paper for themselves.
 *
 * Unlike the admin generator, this one publishes straight away: the student made it
 * to sit it now, and there is no teacher waiting to check it. So the warning about
 * machine written questions is on the screen, not buried in a tick box.
 *
 * Gated by RequireAuth(role="student") in App.tsx, so a user is always signed in here.
 */
export function PracticePage() {
  const navigate = useNavigate();
  const topics = useApi(topicList, []);
  const rates = useApi(practiceRates, []);
  const limits = useApi(practiceLimits, []);

  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Counts>(NO_COUNTS);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const seconds = useElapsed(busy);

  const toggle = useCallback((codes: string[], on: boolean) => {
    setChosen((current) => {
      const next = new Set(current);
      for (const code of codes) {
        if (on) {
          next.add(code);
        } else {
          next.delete(code);
        }
      }
      return next;
    });
  }, []);

  if (topics.loading || rates.loading) {
    return <Spinner label="Loading the syllabus..." />;
  }
  if (topics.error || rates.error || !topics.data || !rates.data) {
    return <ErrorBox message={topics.error ?? rates.error ?? "Could not load the syllabus"} />;
  }

  const shape = shapeFrom(counts, rates.data);
  const left = limits.data ? limits.data.per_day - limits.data.made_today : null;
  const tooMany = limits.data ? shape.questions > limits.data.questions_at_once : false;
  const ready = chosen.size > 0 && shape.questions > 0 && !tooMany && left !== 0;

  async function make() {
    setBusy(true);
    setProblem(null);
    try {
      const made = await makePractice({
        title: title(chosen, topics.data ?? []),
        topic_codes: [...chosen],
        counts,
      });
      navigate(`/papers/${made.paper_id}`);
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : String(cause));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Card>
          <SectionHeading hint={`${chosen.size} selected`}>1. Choose topics</SectionHeading>
          <p className="mb-3 text-sm text-slate-500">
            Select a main topic, then choose specific parts if you want to focus your practice.
          </p>
          <TopicWizard topics={topics.data} chosen={chosen} onToggle={toggle} />
        </Card>

        <div className="space-y-5 lg:sticky lg:top-24">
          <Card>
            <SectionHeading>2. Questions &amp; time</SectionHeading>
            <div className="space-y-3">
              <CountField
                label="MCQ count"
                hint="2.4 minutes each"
                value={counts.mcq}
                onChange={(mcq) => setCounts({ ...counts, mcq })}
              />
              <CountField
                label="Structured"
                hint="15 minutes each"
                value={counts.structured}
                onChange={(structured) => setCounts({ ...counts, structured })}
              />
              <CountField
                label="Essay"
                hint="30 minutes each"
                value={counts.essay}
                onChange={(essay) => setCounts({ ...counts, essay })}
              />
            </div>

            <div className="mt-5">
              <PaperShape counts={counts} rates={rates.data} />
            </div>

            {tooMany && limits.data && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {shape.questions} questions at once is too many. The most is{" "}
                {limits.data.questions_at_once}.
              </p>
            )}
          </Card>

          <Card className="p-4">
            <Button disabled={!ready || busy} onClick={() => void make()} className="w-full">
              {busy ? "Writing..." : "Make my paper"}
            </Button>

            {left === 0 && (
              <p className="mt-2 text-center text-xs text-slate-500">
                You have used today&apos;s practice papers. Try again tomorrow.
              </p>
            )}

            {busy && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <Steps steps={writingSteps(seconds, shape.questions)} />
                <p className="mt-3 text-xs text-slate-500">
                  Writing questions takes a minute or two. It opens as soon as it is ready.
                </p>
              </div>
            )}

          </Card>

          {problem && <ErrorBox message={problem} hint={hintFor(problem)} />}
        </div>
      </div>
    </div>
  );
}

function CountField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = `practice-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="flex-1 text-sm">
        {label}
        <span className="block text-xs text-slate-400">{hint}</span>
      </label>
      <input
        id={id}
        type="number"
        min={0}
        max={60}
        value={value}
        onChange={(event) => onChange(Math.max(0, Math.min(60, Number(event.target.value) || 0)))}
        className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm tabular-nums focus:border-brand-500 focus:outline-none"
      />
    </div>
  );
}

function title(chosen: Set<string>, topics: Topic[]): string {
  const names = topics.filter((t) => chosen.has(t.code)).map((t) => t.name);
  if (names.length === 0) {
    return "Practice paper";
  }
  const more = names.length > 2 ? ` and ${names.length - 2} more` : "";
  return `Practice: ${names.slice(0, 2).join(", ")}${more}`;
}

function writingSteps(seconds: number, questions: number): Step[] {
  return [
    {
      label: `Asking for ${questions} ${questions === 1 ? "question" : "questions"}`,
      detail: seconds > 0 ? `${spell(seconds)} so far` : undefined,
      state: seconds >= 1 ? "done" : "doing",
    },
    {
      label: "Writing them, with how they will be marked",
      state: seconds >= 1 ? "doing" : "waiting",
    },
    { label: "Opening your paper", state: "waiting" },
  ];
}

function hintFor(message: string): string | undefined {
  if (message.includes("limit")) {
    return "The number of papers is capped so everyone gets a turn.";
  }
  if (message.includes("No AI model")) {
    return "Ask whoever runs the service to set an AI key.";
  }
  if (message.includes("Nothing usable")) {
    return "Try fewer questions, or pick more topics.";
  }
  return undefined;
}
