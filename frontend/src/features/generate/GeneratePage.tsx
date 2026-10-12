import { useCallback, useState } from "react";
import { Link } from "react-router-dom";

import { generatePaper, generatorRates, listTopics } from "@/api/admin";
import { ApiError } from "@/api/client";
import type { Counts, GeneratedPaper } from "@/api/types";
import { Button } from "@/components/Button";
import { Card, SectionHeading } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { Hero } from "@/components/Hero";
import { Spinner } from "@/components/Spinner";
import type { Step } from "@/components/Steps";
import { Steps } from "@/components/Steps";
import { useApi } from "@/hooks/useApi";
import { spell, useElapsed } from "@/hooks/useElapsed";
import { shapeFrom } from "@/lib/shape";
import { readAdminKey, saveAdminKey } from "@/lib/teacher";

import { CheckPaper } from "./CheckPaper";
import { PaperShape } from "./PaperShape";
import { TopicPicker } from "./TopicPicker";

const NO_COUNTS: Counts = { mcq: 0, structured: 0, essay: 0 };

export function GeneratePage() {
  const [signedIn, setSignedIn] = useState(() => readAdminKey() !== "");

  if (!signedIn) {
    return <AdminSignIn onReady={() => setSignedIn(true)} />;
  }
  return <Generator onSignOut={() => setSignedIn(false)} />;
}

function Generator({ onSignOut }: { onSignOut: () => void }) {
  const topics = useApi(listTopics, []);
  const rates = useApi(generatorRates, []);

  const [title, setTitle] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Counts>(NO_COUNTS);
  const [made, setMade] = useState<GeneratedPaper | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
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
    return (
      <ErrorBox
        message={topics.error ?? rates.error ?? "Could not load the syllabus"}
        hint="A wrong admin key gives 401. Sign out and try again."
      />
    );
  }

  const shape = shapeFrom(counts, rates.data);
  const ready = chosen.size > 0 && shape.questions > 0;

  async function generate() {
    setBusy(true);
    setProblem(null);
    try {
      setMade(
        await generatePaper({
          title: title.trim() || defaultTitle(chosen),
          topic_codes: [...chosen],
          counts,
        }),
      );
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  if (published && made) {
    return (
      <Card>
        <SectionHeading>Published</SectionHeading>
        <p className="text-slate-600">
          <strong>{made.title}</strong> is now open to students.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to={`/papers/${made.paper_id}`}>
            <Button>Open the paper</Button>
          </Link>
          <Button
            variant="secondary"
            onClick={() => {
              setMade(null);
              setPublished(false);
            }}
          >
            Make another
          </Button>
        </div>
      </Card>
    );
  }

  if (made) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setMade(null)}
          className="text-sm text-brand-700 hover:underline"
        >
          &larr; Generate another
        </button>
        <CheckPaper made={made} onPublished={() => setPublished(true)} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Hero eyebrow="Model papers" title="Make a paper from the syllabus">
        <p>
          Choose the topics and how many questions of each kind. The time allowed follows the real
          examination, and the paper is saved as a draft for you to check.
        </p>
      </Hero>

      <div className="flex flex-wrap justify-end gap-3">
        <Link to="/admin/papers">
          <Button variant="secondary">Manage papers &amp; schemes</Button>
        </Link>
        <Button
          variant="secondary"
          onClick={() => {
            saveAdminKey("");
            onSignOut();
          }}
        >
          Sign out
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Card>
          <SectionHeading hint={`${chosen.size} chosen`}>Topics</SectionHeading>
          <TopicPicker topics={topics.data} chosen={chosen} onToggle={toggle} />
        </Card>

        <div className="space-y-5 lg:sticky lg:top-24">
          <Card>
            <SectionHeading>Questions</SectionHeading>
            <div className="space-y-3">
              <CountField
                label="Multiple choice"
                hint="2.4 minutes each"
                value={counts.mcq}
                max={rates.data.max_per_section}
                onChange={(mcq) => setCounts({ ...counts, mcq })}
              />
              <CountField
                label="Structured"
                hint="15 minutes each"
                value={counts.structured}
                max={rates.data.max_per_section}
                onChange={(structured) => setCounts({ ...counts, structured })}
              />
              <CountField
                label="Essay"
                hint="30 minutes each"
                value={counts.essay}
                max={rates.data.max_per_section}
                onChange={(essay) => setCounts({ ...counts, essay })}
              />
            </div>

            <div className="mt-5">
              <PaperShape counts={counts} rates={rates.data} />
            </div>
          </Card>

          <Card>
            <label htmlFor="paper-title" className="block text-sm text-slate-600">
              Title (optional)
            </label>
            <input
              id="paper-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              placeholder={defaultTitle(chosen)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />

            <div className="mt-4">
              <Button disabled={!ready || busy} onClick={() => void generate()} className="w-full">
                {busy ? "Writing..." : "Generate the paper"}
              </Button>
              {!ready && (
                <p className="mt-2 text-xs text-slate-500">
                  Choose at least one topic and one question.
                </p>
              )}
            </div>

            {busy && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <Steps steps={writingSteps(seconds, shape.questions)} />
                <p className="mt-3 text-xs text-slate-500">
                  Writing questions and their marking points takes a minute or two.
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
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const id = `count-${label.replace(/\s+/g, "-").toLowerCase()}`;
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
        max={max}
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value), max))}
        className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm tabular-nums focus:border-brand-500 focus:outline-none"
      />
    </div>
  );
}

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(max, Math.floor(value)));
}

function defaultTitle(chosen: Set<string>): string {
  const codes = [...chosen];
  if (codes.length === 0) {
    return "Model paper";
  }
  const more = codes.length > 2 ? ` and ${codes.length - 2} more` : "";
  return `Model paper: ${codes.slice(0, 2).join(", ")}${more}`;
}

function writingSteps(seconds: number, questions: number): Step[] {
  return [
    {
      label: `Asking for ${questions} ${questions === 1 ? "question" : "questions"}`,
      detail: seconds > 0 ? `${spell(seconds)} so far` : undefined,
      state: seconds >= 1 ? "done" : "doing",
    },
    {
      label: "Writing the questions and their marking points",
      state: seconds >= 1 ? "doing" : "waiting",
    },
    { label: "Checking each one can actually be marked", state: "waiting" },
    { label: "Saving as a draft for you to read", state: "waiting" },
  ];
}

function hintFor(message: string): string | undefined {
  if (message.includes("No AI model")) {
    return "Set an AI key in the service .env file, then restart it.";
  }
  if (message.includes("Nothing usable")) {
    return "Try fewer questions at once, or pick more topics to draw from.";
  }
  if (message.includes("401")) {
    return "The admin key is wrong. Sign out and enter it again.";
  }
  return undefined;
}

function AdminSignIn({ onReady }: { onReady: () => void }) {
  const [key, setKey] = useState("");

  return (
    <Card className="mx-auto max-w-md">
      <SectionHeading>Make a model paper</SectionHeading>
      <p className="text-sm text-slate-500">
        The key is the <code className="font-mono">ADMIN_API_KEY</code> from the service settings.
        It is forgotten when you close this tab.
      </p>

      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (key.trim()) {
            saveAdminKey(key.trim());
            onReady();
          }
        }}
      >
        <div className="space-y-1">
          <label htmlFor="admin-key" className="block text-sm text-slate-600">
            Admin key
          </label>
          <input
            id="admin-key"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <Button type="submit" className="w-full">
          Continue
        </Button>
      </form>
    </Card>
  );
}
