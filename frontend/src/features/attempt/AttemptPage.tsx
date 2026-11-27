import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { clearAnswer, getAttempt, saveAnswer, submitAttempt } from "@/api/attempts";
import { ApiError } from "@/api/client";
import { getPaper, getPaperFile } from "@/api/papers";
import type { AnswerInput, AnswerOut, Attempt, PaperDetail } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { PdfViewer } from "@/components/PdfViewer";
import { Spinner } from "@/components/Spinner";
import { answerableQuestions, hasMcq, isMcq, optionLabels } from "@/lib/questions";

import { AnswerSheetUpload } from "./AnswerSheetUpload";
import { ExamTimer } from "./ExamTimer";
import { MarkingProgress } from "./MarkingProgress";
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
  const [readings, setReadings] = useState<Record<number, AnswerOut>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitting, setSubmitting] = useState(false);
  // The mcq question ids covered by a photo currently under review (null when
  // there is none) - those hide their own picker below, since correcting a
  // choice happens in the review grid instead. Anything the photo missed stays
  // visible here, so a block the reader could not line up is never un-answerable.
  const [reviewedIds, setReviewedIds] = useState<Set<number> | null>(null);
  // Picks already in that review grid, not yet saved - shown alongside the real
  // "answered" count so filling the sheet doesn't look like nothing happened
  // until "Use these N answers" is actually pressed (see Progress).
  const [readyToSave, setReadyToSave] = useState(0);
  const inFlight = useRef(0);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const loaded = await getAttempt(attemptId, signal);
        const itsPaper = await getPaper(loaded.paper_id, signal);
        setAttempt(loaded);
        setPaper(itsPaper);
        const answered = loaded.questions.filter((question) => question.answer);
        setGiven(
          Object.fromEntries(
            answered.map((question) => [
              question.question_id,
              { option: question.answer!.mcq_option, text: question.answer!.text ?? "" },
            ]),
          ),
        );
        setReadings(
          Object.fromEntries(
            answered
              .filter((question) => question.answer!.reader)
              .map((question) => [question.question_id, question.answer!]),
          ),
        );
      } catch (cause) {
        if (!signal?.aborted) {
          setLoadError(cause instanceof ApiError ? cause.message : String(cause));
        }
      }
    },
    [attemptId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!paper?.has_pdf) {
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    getPaperFile(paper.id, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      })
      .catch(() => {
        // Nothing to show if this fails; the question list still works without it.
      });
    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [paper?.id, paper?.has_pdf]);

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

  const unchoose = useCallback(
    async (questionId: number) => {
      inFlight.current += 1;
      setSaveState("saving");
      try {
        await clearAnswer(attemptId, questionId);
        inFlight.current -= 1;
        setSaveState(inFlight.current === 0 ? "saved" : "saving");
      } catch {
        inFlight.current -= 1;
        setSaveState("failed");
      }
    },
    [attemptId],
  );

  const choose = useCallback(
    (questionId: number, option: string | null) => {
      setGiven((current) => ({
        ...current,
        [questionId]: { ...(current[questionId] ?? BLANK), option },
      }));
      if (option === null) {
        void unchoose(questionId);
      } else {
        void send(questionId, { mcq_option: option });
      }
    },
    [send, unchoose],
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

  /** A photo was read: put the transcription in the box for the student to check. */
  const handleRead = useCallback((questionId: number, answer: AnswerOut) => {
    setReadings((current) => ({ ...current, [questionId]: answer }));
    setGiven((current) => ({
      ...current,
      [questionId]: { ...(current[questionId] ?? BLANK), text: answer.text ?? "" },
    }));
  }, []);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      setAttempt(await submitAttempt(attemptId));
    } catch (cause) {
      setLoadError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }, [attemptId]);

  // Time is up: send whatever has been answered. Unlike the Submit button this does
  // not wait for a tidy state - an unfinished paper still has to go in.
  const submitOnTime = useCallback(() => void submit(), [submit]);

  if (loadError) {
    return <ErrorBox message={loadError} />;
  }
  if (!attempt || !paper) {
    return <Spinner label="Loading your attempt..." />;
  }

  const locked = attempt.status !== "in_progress";
  const points = attempt.questions.flatMap((question) => question.points);
  // The machine can still be working (a "pending" point, waiting on the AI judge) -
  // that is the only time the whole page should block on a progress screen. Once
  // every point has SOME verdict, the student sees their results immediately: the
  // ones a teacher still needs to check are shown as exactly that, in ResultList,
  // rather than hiding every other already-decided question behind them too.
  const marking = attempt.status === "submitted" && points.some((point) => point.status === "pending");
  const needsTeacherCount = points.filter((point) => point.status === "needs_review").length;
  // The mark to show, and whether it can still move. A point parked for a teacher
  // can only add marks, so until those are decided this is a floor, not the result.
  const shownScore = attempt.score ?? confirmedSoFar(points);
  const scoreIsFinal = attempt.score !== null && needsTeacherCount === 0;
  const scorePercent =
    attempt.max_score > 0 ? Math.round((shownScore / attempt.max_score) * 100) : null;
  const items = answerableQuestions(paper);
  const mcqOptionLabels = optionLabels(paper);
  const answered = items.filter((item) => {
    const value = given[item.question.id];
    return isMcq(item) ? Boolean(value?.option) : Boolean(value?.text.trim());
  }).length;

  const body = (
    <>
      {marking ? (
        <MarkingProgress attempt={attempt} />
      ) : locked ? (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium tracking-tight">Result</h2>
              <p className="text-sm text-slate-500">
                {scoreIsFinal ? "Final mark" : "Marked so far - not your final mark yet"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-semibold tabular-nums text-brand-700">
                {shownScore}
                <span className="text-xl font-normal text-slate-400"> / {attempt.max_score}</span>
                <span className="text-base font-normal text-slate-500"> marks</span>
              </p>
              {scorePercent !== null && (
                <p className="text-sm tabular-nums text-slate-500">{scorePercent}%</p>
              )}
            </div>
          </div>
          {needsTeacherCount > 0 && (
            <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {needsTeacherCount === 1 ? "One marking point is" : `${needsTeacherCount} marking points are`}{" "}
              parked for a teacher to check, for a more accurate result - see below for which ones.
              Everything else here is your real mark already.
            </p>
          )}
          {/* Right after the score, not after scrolling past every question - this
           * is where to go next, not another thing to read. */}
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/papers"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-600/25 transition hover:bg-brand-700 hover:shadow-lg"
            >
              Try another paper
            </Link>
            <Link
              to="/my-results"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white/80 px-5 py-2.5 text-sm font-medium text-slate-700 backdrop-blur transition hover:border-brand-300 hover:bg-white"
            >
              See all my results
            </Link>
          </div>
          <div className="mt-6 border-t border-slate-100 pt-4">
            <ResultList attempt={attempt} />
          </div>
        </Card>
      ) : (
        <>
          <Card className="sticky top-4 z-10">
            <div className="mb-3">
              <ExamTimer
                expiresAt={attempt.expires_at}
                durationMinutes={attempt.duration_minutes}
                onExpire={submitOnTime}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-48 flex-1">
                <Progress answered={answered} total={items.length} readyToSave={readyToSave} />
              </div>
              <div className="flex items-center gap-3">
                <SaveHint state={saveState} />
                <Button
                  onClick={submit}
                  disabled={submitting || answered === 0 || readyToSave > 0}
                  title={
                    readyToSave > 0
                      ? "Confirm your uploaded answer sheet above first - those picks are not saved yet"
                      : undefined
                  }
                >
                  {submitting ? "Sending your answers..." : "Submit"}
                </Button>
              </div>
            </div>
            {readyToSave > 0 && (
              <p className="mt-2 text-xs text-amber-700">
                {readyToSave} pick{readyToSave === 1 ? "" : "s"} in the uploaded sheet above{" "}
                {readyToSave === 1 ? "is" : "are"} not saved yet - press "Use these {readyToSave}{" "}
                answer{readyToSave === 1 ? "" : "s"}" there before submitting, or they will be left out.
              </p>
            )}
          </Card>

          {hasMcq(paper) && (
            <AnswerSheetUpload
              attemptId={attemptId}
              optionLabels={mcqOptionLabels}
              totalMcqQuestions={items.filter(isMcq).length}
              onSaved={() => void reload()}
              onReviewingChange={setReviewedIds}
              onReadyCountChange={setReadyToSave}
            />
          )}

          <Card>
            {/* An mcq question a just-uploaded photo covers is left out here -
             * correcting it happens in that review grid, not twice. Anything the
             * photo missed (or never existed, with no upload at all) stays here. */}
            {items
              .filter((item) => !reviewedIds?.has(item.question.id))
              .map((item, index, visible) => {
                const previous = visible[index - 1];
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
                      reading={readings[item.question.id] ?? null}
                      attemptId={attemptId}
                      disabled={locked}
                      mcqOptionLabels={mcqOptionLabels}
                      onChoose={(option) => choose(item.question.id, option)}
                      onWrite={(text) => write(item.question.id, text)}
                      onRead={(answer) => handleRead(item.question.id, answer)}
                    />
                  </div>
                );
              })}
          </Card>
        </>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/papers/${paper.id}`} className="text-sm text-brand-700 hover:underline">
          &larr; Back to the paper
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{paper.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span>Student {attempt.student_ref}</span>
          <Badge tone={locked ? "good" : "neutral"}>{attempt.status.replace("_", " ")}</Badge>
          <span>marking scheme v{attempt.scheme_version}</span>
        </p>
      </div>

      {paper.has_pdf ? (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="h-[75vh] lg:sticky lg:top-4">
            {pdfUrl ? (
              <PdfViewer fileUrl={pdfUrl} />
            ) : (
              <Spinner label="Loading the paper..." />
            )}
          </div>
          <div className="space-y-6">{body}</div>
        </div>
      ) : (
        <div className="space-y-6">{body}</div>
      )}
    </div>
  );
}

/**
 * Marks confirmed so far, from only the points with a final verdict - a needs_review
 * point's own `awarded` is a 0.0 placeholder, not a real decision, so it is left out
 * rather than counted as a loss. Shown instead of attempt.score while that stays
 * null (some point of some answer is not final yet), so a student sees the marks
 * they have actually earned rather than a blank dash.
 */
function confirmedSoFar(points: Attempt["questions"][number]["points"]): number {
  return points
    .filter((point) => point.status === "awarded" || point.status === "not_awarded")
    .reduce((total, point) => total + (point.awarded ?? 0), 0);
}

function SaveHint({ state }: { state: SaveState }) {
  if (state === "idle") {
    return null;
  }
  const text = { saving: "saving...", saved: "saved", failed: "could not save" }[state];
  const colour = state === "failed" ? "text-rose-600" : "text-slate-400";
  return <span className={`text-xs ${colour}`}>{text}</span>;
}
