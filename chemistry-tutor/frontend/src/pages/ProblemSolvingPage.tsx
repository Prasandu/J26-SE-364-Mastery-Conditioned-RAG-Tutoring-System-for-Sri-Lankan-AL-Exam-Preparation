import { useEffect, useState } from "react";
import { HintPanel } from "../components/hints/HintPanel";
import { InterventionPanel } from "../components/learning_state/InterventionPanel";
import { MicButton } from "../components/voice/MicButton";
import { checkAnswer, listQuestions, requestHint } from "../services/questionsApi";
import { getInterventions } from "../services/studentsApi";
import type { Intervention } from "../types/intervention";
import type { HintResponse, QuestionSummary } from "../types/question";

export function ProblemSolvingPage() {
  const [studentId, setStudentId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");

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

  if (!studentId) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="w-80 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-2 text-lg font-semibold">Enter your name</h2>
          <p className="mb-3 text-sm text-gray-500">
            Used to track your practice progress. (Temporary — will be replaced by real login
            later.)
          </p>
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="Your name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && nameInput.trim() && setStudentId(nameInput.trim())}
          />
          <button
            onClick={() => nameInput.trim() && setStudentId(nameInput.trim())}
            disabled={!nameInput.trim()}
            className="mt-3 w-full rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Start
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gray-50">
      <aside className="w-64 overflow-y-auto border-r bg-white p-3">
        <h2 className="mb-2 text-sm font-semibold text-gray-500">Questions</h2>
        {questions.map((q) => (
          <button
            key={q.question_code}
            onClick={() => selectQuestion(q)}
            className={`mb-1 block w-full rounded px-2 py-2 text-left text-sm ${
              selected?.question_code === q.question_code
                ? "bg-blue-100 text-blue-800"
                : "hover:bg-gray-100"
            }`}
          >
            {q.question_code} ({q.difficulty})
          </button>
        ))}

        <button
          onClick={handleCheckProgress}
          disabled={checkingProgress}
          className="mt-4 w-full rounded bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {checkingProgress ? "Checking..." : "How am I doing?"}
        </button>

        {interventions !== null && (
          <div className="mt-3">
            <InterventionPanel interventions={interventions} />
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {questionsLoading && <p className="text-gray-400">Loading questions...</p>}
        {questionsError && (
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
        {!questionsLoading && !questionsError && !selected && (
          <p className="text-gray-400">No questions available.</p>
        )}

        {selected && (
          <div className="mx-auto max-w-2xl">
            <p className="mb-2 text-xs text-gray-400">Practicing as: {studentId}</p>
            <h1 className="text-lg font-semibold">{selected.question_code}</h1>
            <p className="mt-2 text-gray-800">{selected.question_text}</p>

            <div className="mt-4 flex gap-2">
              <input
                className="flex-1 rounded border px-3 py-2 text-sm"
                placeholder="Your answer..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
              <MicButton
                language="en"
                disabled={loading}
                onTranscribed={(text) => setAnswer(text)}
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
                className="rounded bg-gray-500 px-3 py-1.5 text-sm text-white disabled:opacity-50"
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
