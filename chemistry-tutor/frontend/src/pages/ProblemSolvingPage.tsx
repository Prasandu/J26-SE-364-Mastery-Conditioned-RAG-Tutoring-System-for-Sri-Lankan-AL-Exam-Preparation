import { useEffect, useState } from "react";
import { HintPanel } from "../components/hints/HintPanel";
import { InterventionPanel } from "../components/learning_state/InterventionPanel";
import { useAuth } from "../contexts/AuthContext";
import { checkAnswer, listQuestions, requestHint } from "../services/questionsApi";
import { checkFlaggedAnswer, getReviewQueue, requestFlaggedHint } from "../services/practiceApi";
import { getInterventions } from "../services/studentsApi";
import type { Intervention } from "../types/intervention";
import type { FlaggedQuestion } from "../types/practice";
import type { HintResponse, QuestionSummary } from "../types/question";

type PracticeMode = "questions" | "mistakes";

export function ProblemSolvingPage() {
  const { user } = useAuth();
  const studentId = user!.id;
  // "Practice Questions" (verified_questions) mode is hidden for now per
  // request — Review Mistakes is the only mode shown. The code/state for
  // "questions" mode is left in place (just unreachable via the UI) so
  // it's easy to re-enable later rather than ripping it out.
  const [mode] = useState<PracticeMode>("mistakes");

  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [selected, setSelected] = useState<QuestionSummary | null>(null);
  const [questionShownAt, setQuestionShownAt] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [hints, setHints] = useState<HintResponse[]>([]);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [interventions, setInterventions] = useState<Intervention[] | null>(null);
  const [checkingProgress, setCheckingProgress] = useState(false);

  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  // "Review Mistakes" — questions flagged wrong by other components
  // (e.g. model-paper marking), walked through step by step here.
  const [flaggedQuestions, setFlaggedQuestions] = useState<FlaggedQuestion[]>([]);
  const [flaggedLoading, setFlaggedLoading] = useState(false);
  const [flaggedError, setFlaggedError] = useState<string | null>(null);
  const [selectedFlagged, setSelectedFlagged] = useState<FlaggedQuestion | null>(null);
  const [flaggedAnswer, setFlaggedAnswer] = useState("");
  const [flaggedAttempts, setFlaggedAttempts] = useState(0);
  const [flaggedHints, setFlaggedHints] = useState<HintResponse[]>([]);
  const [flaggedFeedback, setFlaggedFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [flaggedActionLoading, setFlaggedActionLoading] = useState(false);

  function loadReviewQueue() {
    if (!studentId) return;
    setFlaggedLoading(true);
    setFlaggedError(null);
    getReviewQueue(studentId)
      .then((items) => {
        setFlaggedQuestions(items);
        setSelectedFlagged(items.length > 0 ? items[0] : null);
      })
      .catch((err) => {
        setFlaggedError(err instanceof Error ? err.message : "Could not load review queue");
      })
      .finally(() => setFlaggedLoading(false));
  }

  useEffect(() => {
    if (studentId) loadReviewQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  function selectFlagged(f: FlaggedQuestion) {
    setSelectedFlagged(f);
    setFlaggedAnswer("");
    setFlaggedAttempts(0);
    setFlaggedHints([]);
    setFlaggedFeedback(null);
    setFlaggedError(null);
  }

  const flaggedHasFinalSolution = flaggedHints.some((h) => h.level === 5);

  function dropFromQueue(id: number) {
    setFlaggedQuestions((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleFlaggedSubmit() {
    if (!selectedFlagged || !flaggedAnswer.trim() || flaggedActionLoading) return;
    setFlaggedActionLoading(true);
    setFlaggedError(null);
    try {
      const result = await checkFlaggedAnswer(selectedFlagged.id, flaggedAnswer.trim());
      if (result.correct === true) {
        setFlaggedFeedback("correct");
        dropFromQueue(selectedFlagged.id);
      } else if (result.correct === false) {
        setFlaggedFeedback("incorrect");
        setFlaggedAttempts((prev) => prev + 1);
      } else {
        // No reference answer available to check against.
        setFlaggedError("No reference answer available — try a hint instead.");
      }
    } catch (err) {
      setFlaggedError(err instanceof Error ? err.message : "Something went wrong submitting your answer");
    } finally {
      setFlaggedActionLoading(false);
    }
  }

  async function handleFlaggedGetHint(requestedFullSolution: boolean) {
    if (!selectedFlagged || flaggedActionLoading || flaggedHasFinalSolution) return;
    setFlaggedActionLoading(true);
    setFlaggedError(null);
    try {
      const hint = await requestFlaggedHint(
        selectedFlagged.id,
        flaggedAttempts,
        flaggedHints.length,
        requestedFullSolution,
      );
      setFlaggedHints((prev) => [...prev, hint]);
      if (hint.level === 5) dropFromQueue(selectedFlagged.id);
    } catch (err) {
      setFlaggedError(err instanceof Error ? err.message : "Something went wrong getting the hint");
    } finally {
      setFlaggedActionLoading(false);
    }
  }

  function loadQuestions() {
    setQuestionsLoading(true);
    setQuestionsError(null);
    listQuestions()
      .then((qs) => {
        setQuestions(qs);
        if (qs.length > 0) {
          setSelected(qs[0]);
          setQuestionShownAt(Date.now());
        }
      })
      .catch((err) => {
        setQuestionsError(
          err instanceof Error ? err.message : "Could not load questions from the server",
        );
      })
      .finally(() => setQuestionsLoading(false));
  }

  useEffect(() => {
    loadQuestions();
  }, []);

  function selectQuestion(q: QuestionSummary) {
    setSelected(q);
    setQuestionShownAt(Date.now());
    setAttempts(0);
    setHints([]);
    setAnswer("");
    setFeedback(null);
    setError(null);
  }

  const hasFinalSolution = hints.some((h) => h.level === 5);

  async function handleGetHint(requestedFullSolution: boolean) {
    if (!selected || !studentId || loading || hasFinalSolution) return;
    setLoading(true);
    setError(null);
    try {
      const hint = await requestHint(
        studentId,
        selected.question_code,
        attempts,
        hints.length,
        requestedFullSolution,
      );
      setHints((prev) => [...prev, hint]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong getting the hint");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!selected || !studentId || !answer.trim() || loading || questionShownAt === null) return;
    setLoading(true);
    setError(null);
    try {
      const timeSeconds = (Date.now() - questionShownAt) / 1000;
      const result = await checkAnswer(
        studentId,
        selected.question_code,
        answer.trim(),
        hints.length,
        timeSeconds,
      );
      if (result.correct) {
        setFeedback("correct");
      } else {
        setFeedback("incorrect");
        setAttempts((prev) => prev + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong submitting your answer");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckProgress() {
    if (!studentId || checkingProgress) return;
    setCheckingProgress(true);
    try {
      const result = await getInterventions(studentId);
      setInterventions(result);
    } finally {
      setCheckingProgress(false);
    }
  }

  return (
    <div className="flex h-full bg-slate-50">
      <aside className="w-64 overflow-y-auto border-r bg-white p-3">
        {mode === "questions" && (
          <>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">Questions</h2>
            {questions.map((q) => (
              <button
                key={q.question_code}
                onClick={() => selectQuestion(q)}
                className={`mb-1 block w-full rounded px-2 py-2 text-left text-sm ${
                  selected?.question_code === q.question_code
                    ? "bg-blue-100 text-blue-800"
                    : "hover:bg-slate-100"
                }`}
              >
                {q.question_code} ({q.difficulty})
              </button>
            ))}

            <button
              onClick={handleCheckProgress}
              disabled={checkingProgress}
              className="mt-4 w-full rounded bg-blue-800 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {checkingProgress ? "Checking..." : "How am I doing?"}
            </button>

            {interventions !== null && (
              <div className="mt-3">
                <InterventionPanel interventions={interventions} />
              </div>
            )}
          </>
        )}

        {mode === "mistakes" && (
          <>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">Questions you got wrong</h2>
            {flaggedLoading && <p className="text-xs text-slate-400">Loading...</p>}
            {flaggedQuestions.length === 0 && !flaggedLoading && (
              <p className="text-xs text-slate-400">
                Nothing to review right now — nice work!
              </p>
            )}
            {flaggedQuestions.map((f) => (
              <button
                key={f.id}
                onClick={() => selectFlagged(f)}
                className={`mb-1 block w-full rounded px-2 py-2 text-left text-sm ${
                  selectedFlagged?.id === f.id ? "bg-blue-100 text-blue-800" : "hover:bg-slate-100"
                }`}
              >
                <span className="block font-medium">{f.topic}</span>
                {f.sub_topic && <span className="block text-xs text-slate-500">{f.sub_topic}</span>}
              </button>
            ))}
          </>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {mode === "questions" && questionsLoading && <p className="text-slate-400">Loading questions...</p>}
        {mode === "questions" && questionsError && (
          <div className="rounded border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">Could not load questions: {questionsError}</p>
            <button
              onClick={loadQuestions}
              className="mt-2 rounded bg-red-600 px-3 py-1.5 text-sm text-white"
            >
              Retry
            </button>
          </div>
        )}
        {mode === "questions" && !questionsLoading && !questionsError && !selected && (
          <p className="text-slate-400">No questions available.</p>
        )}

        {mode === "mistakes" && flaggedError && (
          <div className="rounded border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">Could not load: {flaggedError}</p>
            <button
              onClick={loadReviewQueue}
              className="mt-2 rounded bg-red-600 px-3 py-1.5 text-sm text-white"
            >
              Retry
            </button>
          </div>
        )}
        {mode === "mistakes" && !flaggedLoading && flaggedQuestions.length === 0 && (
          <p className="text-slate-400">No wrong answers to review right now.</p>
        )}

        {mode === "mistakes" && selectedFlagged && (
          <div className="mx-auto max-w-2xl">
            <p className="mb-2 text-xs text-slate-400">Reviewing as: {studentId}</p>
            <h1 className="text-lg font-semibold">
              {selectedFlagged.topic}
              {selectedFlagged.sub_topic && (
                <span className="text-slate-500"> — {selectedFlagged.sub_topic}</span>
              )}
            </h1>
            <p className="mt-2 text-slate-800">{selectedFlagged.question_text}</p>

            <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm">
              <span className="font-medium text-red-700">What you answered before: </span>
              <span className="text-red-700">{selectedFlagged.submitted_answer}</span>
            </div>

            <div className="mt-4 flex gap-2">
              <input
                className="flex-1 rounded border px-3 py-2 text-sm"
                placeholder="Your answer..."
                value={flaggedAnswer}
                onChange={(e) => setFlaggedAnswer(e.target.value)}
              />
              <button
                onClick={handleFlaggedSubmit}
                disabled={flaggedActionLoading || !flaggedAnswer.trim()}
                className="rounded bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Submit
              </button>
            </div>

            {flaggedFeedback === "correct" && (
              <p className="mt-2 text-sm font-medium text-green-700">Correct! Nice work.</p>
            )}
            {flaggedFeedback === "incorrect" && (
              <p className="mt-2 text-sm font-medium text-red-600">
                Not quite — try again, or ask for a hint.
              </p>
            )}
            {flaggedError && <p className="mt-2 text-sm font-medium text-red-600">Error: {flaggedError}</p>}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => handleFlaggedGetHint(false)}
                disabled={flaggedActionLoading || flaggedHasFinalSolution}
                className="rounded bg-amber-500 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Get Hint
              </button>
              <button
                onClick={() => handleFlaggedGetHint(true)}
                disabled={flaggedActionLoading || flaggedHasFinalSolution}
                className="rounded bg-slate-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Show Full Solution
              </button>
            </div>

            <HintPanel hints={flaggedHints} />
          </div>
        )}

        {mode === "questions" && selected && (
          <div className="mx-auto max-w-2xl">
            <p className="mb-2 text-xs text-slate-400">Practicing as: {studentId}</p>
            <h1 className="text-lg font-semibold">{selected.question_code}</h1>
            <p className="mt-2 text-slate-800">{selected.question_text}</p>

            <div className="mt-4 flex gap-2">
              <input
                className="flex-1 rounded border px-3 py-2 text-sm"
                placeholder="Your answer..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
              <button
                onClick={handleSubmit}
                disabled={loading || !answer.trim()}
                className="rounded bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Submit
              </button>
            </div>

            {feedback === "correct" && (
              <p className="mt-2 text-sm font-medium text-green-700">
                Correct! {hints.length === 0 ? "Solved independently." : "Solved with assistance."}
              </p>
            )}
            {feedback === "incorrect" && (
              <p className="mt-2 text-sm font-medium text-red-600">
                Not quite — try again, or ask for a hint.
              </p>
            )}
            {error && <p className="mt-2 text-sm font-medium text-red-600">Error: {error}</p>}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => handleGetHint(false)}
                disabled={loading || hasFinalSolution}
                className="rounded bg-amber-500 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Get Hint
              </button>
              <button
                onClick={() => handleGetHint(true)}
                disabled={loading || hasFinalSolution}
                className="rounded bg-slate-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Show Full Solution
              </button>
            </div>

            <HintPanel hints={hints} />
          </div>
        )}
      </main>
    </div>
  );
}
