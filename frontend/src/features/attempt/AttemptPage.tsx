import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getAttempt, saveAnswer, submitAttempt } from "@/api/attempts";
import { ApiError } from "@/api/client";
import { getPaper } from "@/api/papers";
import type { AnswerInput, Attempt, PaperDetail } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { answerableQuestions, isMcq } from "@/lib/questions";

import { Progress } from "./Progress";
import { QuestionBlock } from "./QuestionBlock";
import { ResultList } from "./ResultList";

type SaveState = "idle" | "saving" | "saved" | "failed";

const POLL_EVERY_MS = 2000;

interface Given {
  option: string | null;
  text: string;
}

const BLANK: Given = { option: null, text: "" };

export function AttemptPage() {
  const { attemptId = "" } = useParams();

  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [given, setGiven] = useState<Record<number, Given>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const loaded = await getAttempt(attemptId, controller.signal);
        const itsPaper = await getPaper(loaded.paper_id, controller.signal);
        setAttempt(loaded);
        setPaper(itsPaper);
        setGiven(
          Object.fromEntries(
            loaded.questions
              .filter((question) => question.answer)
              .map((question) => [
                question.question_id,
                { option: question.answer!.mcq_option, text: question.answer!.text ?? "" },
              ]),
          ),
        );
      } catch (cause) {
        if (!controller.signal.aborted) {
          setLoadError(cause instanceof ApiError ? cause.message : String(cause));
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [attemptId]);

  const send = useCallback(
    async (questionId: number, answer: AnswerInput) => {
      inFlight.current += 1;
      setSaveState("saving");
      try {
        await saveAnswer(attemptId, questionId, answer);
        inFlight.current -= 1;
        // Only say "saved" once nothing else is still on its way.
        setSaveState(inFlight.current === 0 ? "saved" : "saving");
      } catch {
        inFlight.current -= 1;
        setSaveState("failed");
      }
    },
    [attemptId],
  );

  const choose = useCallback(
    (questionId: number, option: string) => {
      setGiven((current) => ({
        ...current,
        [questionId]: { ...(current[questionId] ?? BLANK), option },
      }));
      void send(questionId, { mcq_option: option });
    },
    [send],
  );

  const write = useCallback(
    (questionId: number, text: string) => {
      setGiven((current) => ({
        ...current,
        [questionId]: { ...(current[questionId] ?? BLANK), text },
      }));
      // An empty box means "no answer yet", which the backend wants as null.
      void send(questionId, { text: text.trim() === "" ? null : text });
    },
    [send],
  );

  // Marking runs in the background: submit returns "submitted" with the written
  // points still pending, and the AI judge finishes a few seconds later.
  useEffect(() => {
    if (attempt?.status !== "submitted") {
      return;
    }
    const timer = setInterval(async () => {
      try {
        setAttempt(await getAttempt(attemptId));
      } catch {
        // A failed poll is not worth showing; the next one will try again.
      }
    }, POLL_EVERY_MS);
    return () => clearInterval(timer);
  }, [attempt?.status, attemptId]);

  async function submit() {
    setSubmitting(true);
    try {
      setAttempt(await submitAttempt(attemptId));
    } catch (cause) {
      setLoadError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return <ErrorBox message={loadError} />;
  }
  if (!attempt || !paper) {
    return <Spinner label="Loading your attempt..." />;
  }

  const locked = attempt.status !== "in_progress";
  const marking = attempt.status === "submitted";
  const items = answerableQuestions(paper);
  const answered = items.filter((item) => {
    const value = given[item.question.id];
    return isMcq(item) ? Boolean(value?.option) : Boolean(value?.text.trim());
  }).length;

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/papers/${paper.id}`} className="text-sm text-teal-700 hover:underline">
          &larr; Back to the paper
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{paper.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span>Student {attempt.student_ref}</span>
          <Badge tone={locked ? "good" : "neutral"}>{attempt.status.replace("_", " ")}</Badge>
          <span>marking scheme v{attempt.scheme_version}</span>
        </p>
      </div>

      {locked ? (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-medium">Result</h2>
            {marking ? (
              <Spinner label="Marking your written answers..." />
            ) : (
              <p className="text-2xl font-semibold tabular-nums">
                {attempt.score ?? "-"}{" "}
                <span className="text-base font-normal text-slate-400">/ {attempt.max_score}</span>
              </p>
            )}
          </div>
          <div className="mt-4">
            <ResultList attempt={attempt} />
          </div>
        </Card>
      ) : (
        <>
          <Card className="sticky top-4 z-10">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-48 flex-1">
                <Progress answered={answered} total={items.length} />
              </div>
              <div className="flex items-center gap-3">
                <SaveHint state={saveState} />
                <Button onClick={submit} disabled={submitting || answered === 0}>
                  {submitting ? "Marking..." : "Submit"}
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            {items.map((item, index) => {
              const previous = items[index - 1];
              const newStem = item.stem.join("\n") !== (previous?.stem.join("\n") ?? "");
              return (
                <div key={item.question.id}>
                  {newStem && item.stem.length > 0 && (
                    <div className="mt-6 border-t border-slate-200 pt-5 first:mt-0 first:border-t-0">
                      {item.stem.map((line) => (
                        <p key={line} className="whitespace-pre-wrap text-sm text-slate-600">
                          {line}
                        </p>
                      ))}
                    </div>
                  )}
                  <QuestionBlock
                    item={item}
                    chosen={given[item.question.id]?.option ?? null}
                    text={given[item.question.id]?.text ?? ""}
                    disabled={locked}
                    onChoose={(option) => choose(item.question.id, option)}
                    onWrite={(text) => write(item.question.id, text)}
                  />
                </div>
              );
            })}
          </Card>
        </>
      )}
    </div>
  );
}

function SaveHint({ state }: { state: SaveState }) {
  if (state === "idle") {
    return null;
  }
  const text = { saving: "saving...", saved: "saved", failed: "could not save" }[state];
  const colour = state === "failed" ? "text-rose-600" : "text-slate-400";
  return <span className={`text-xs ${colour}`}>{text}</span>;
}
