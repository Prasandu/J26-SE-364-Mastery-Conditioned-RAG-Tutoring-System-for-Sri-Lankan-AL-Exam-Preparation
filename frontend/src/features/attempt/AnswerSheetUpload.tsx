import { useRef, useState } from "react";

import { IMAGE_TYPES, readAnswerSheet, saveAnswers } from "@/api/attempts";
import { ApiError } from "@/api/client";
import type { SheetAnswer, SheetRead } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, SectionHeading } from "@/components/Card";
import type { Step } from "@/components/Steps";
import { Steps } from "@/components/Steps";
import { spell, useElapsed } from "@/hooks/useElapsed";
import { ErrorBox } from "@/components/ErrorBox";

interface Props {
  attemptId: string;
  optionLabels: string[];
  onSaved: () => void;
  // Told whenever a photo's answers are being reviewed (between a successful read
  // and either confirming or leaving to try another one) - while true, the
  // question list below hides its own MCQ pickers, since correcting a choice here
  // is the same action as clicking it there, just shown twice (see AttemptPage.tsx).
  onReviewingChange?: (reviewing: boolean) => void;
}

/**
 * Paper mode for MCQs: photograph the answer sheet instead of clicking 50 options.
 *
 * What the reader saw is shown as a draft the student can change. Nothing is stored
 * until they press the button, so a misread bubble never becomes a mark by itself.
 */
export function AnswerSheetUpload({ attemptId, optionLabels, onSaved, onReviewingChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [read, setRead] = useState<SheetRead | null>(null);
  const [chosen, setChosen] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<"reading" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seconds = useElapsed(busy !== null);

  async function send(file: File) {
    if (!IMAGE_TYPES.includes(file.type)) {
      setError("Please choose a JPEG, PNG or WebP photo.");
      return;
    }
    setBusy("reading");
    setError(null);
    try {
      const result = await readAnswerSheet(attemptId, file);
      setRead(result);
      onReviewingChange?.(true);
      setChosen(
        Object.fromEntries(
          result.answers.filter((a) => a.option).map((a) => [a.question_id, a.option!]),
        ),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusy(null);
      if (input.current) {
        input.current.value = "";
      }
    }
  }

  async function confirm() {
    const answers = Object.entries(chosen).map(([id, option]) => ({
      question_id: Number(id),
      mcq_option: option,
    }));
    if (answers.length === 0) {
      return;
    }
    setBusy("saving");
    try {
      await saveAnswers(attemptId, answers);
      setRead(null);
      onReviewingChange?.(false);
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <SectionHeading hint="Faster than clicking every question">
        Upload your answer sheet
      </SectionHeading>

      <p className="text-sm text-slate-600">
        Photograph the filled sheet flat, from above, in good light. You will be able to check and
        correct everything before it is saved.
      </p>

      <input
        ref={input}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void send(file);
          }
        }}
      />

      <div className="mt-4">
        <Button type="button" disabled={busy !== null} onClick={() => input.current?.click()}>
          {busy === "reading" ? "Reading..." : read ? "Try another photo" : "Choose a photo"}
        </Button>
      </div>

      {busy === "saving" && (
        <div className="mt-5 rounded-2xl bg-brand-50/70 p-4">
          <Steps steps={savingSteps(seconds, Object.keys(chosen).length)} />
          <p className="mt-3 text-xs text-slate-500">
            Writing them all in one go. Please do not close this page.
          </p>
        </div>
      )}

      {busy === "reading" && (
        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <Steps steps={readingSteps(seconds)} />
          <p className="mt-3 text-xs text-slate-500">
            This runs on the server and takes a few seconds. Nothing is saved yet.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <ErrorBox message={error} hint={hintFor(error)} />
        </div>
      )}

      {read && (
        <ReadReview
          read={read}
          chosen={chosen}
          optionLabels={optionLabels}
          busy={busy !== null}
          onPick={(questionId, option) =>
            setChosen((current) => {
              const next = { ...current };
              if (option === null) {
                delete next[questionId];
              } else {
                next[questionId] = option;
              }
              return next;
            })
          }
          onConfirm={() => void confirm()}
        />
      )}
    </Card>
  );
}

interface ReviewProps {
  read: SheetRead;
  chosen: Record<number, string>;
  optionLabels: string[];
  busy: boolean;
  onPick: (questionId: number, option: string | null) => void;
  onConfirm: () => void;
}

function ReadReview({ read, chosen, optionLabels, busy, onPick, onConfirm }: ReviewProps) {
  const unsure = read.answers.filter((a) => a.state === "unsure").length;
  const picked = Object.keys(chosen).length;

  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="good">
          {picked} {picked === 1 ? "answer" : "answers"} ready
        </Badge>
        {unsure > 0 && (
          <Badge tone="warn">
            {unsure} {unsure === 1 ? "row needs" : "rows need"} a look
          </Badge>
        )}
        <span className="text-slate-500">
          read as {read.questions_found} questions with {read.options_found} options
          {read.read_by === "detected grid" && " (layout worked out from the photo)"}
        </span>
      </div>

      <p className="mt-3 text-sm text-slate-600">
        Check every row against your sheet. Click a different option to correct it, or click the
        chosen one again to clear it.
      </p>

      {/* Blocks of 25, side by side, the way the printed sheet's two columns are laid out. */}
      <div className="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {inBlocks(read.answers).map((block) => (
          <section key={block[0].question_id}>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
              {block[0].label} &ndash; {block[block.length - 1].label}
            </h3>
            <ul className="divide-y divide-slate-100">
              {block.map((answer) => (
                <Row
                  key={answer.question_id}
                  answer={answer}
                  chosen={chosen[answer.question_id] ?? null}
                  optionLabels={optionLabels}
                  onPick={(option) => onPick(answer.question_id, option)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button disabled={busy || picked === 0} onClick={onConfirm}>
          {busy ? "Saving..." : `Use ${picked === 1 ? "this answer" : `these ${picked} answers`}`}
        </Button>
        <span className="text-xs text-slate-500">Nothing is saved until you press this.</span>
      </div>
    </div>
  );
}

function Row({
  answer,
  chosen,
  optionLabels,
  onPick,
}: {
  answer: SheetAnswer;
  chosen: string | null;
  optionLabels: string[];
  onPick: (option: string | null) => void;
}) {
  const changed = answer.option !== chosen;
  const note = rowNote(answer, chosen, changed);

  return (
    <li
      className={`flex items-center gap-2 py-1.5 ${
        answer.state === "unsure" ? "bg-amber-50/60" : ""
      }`}
    >
      <span className="w-7 shrink-0 text-right font-mono text-sm text-slate-500">
        {answer.label}
      </span>

      <div className="flex gap-1">
        {optionLabels.map((label) => {
          const active = chosen === label;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={active}
              aria-label={`Question ${answer.label}, option ${label}`}
              onClick={() => onPick(active ? null : label)}
              className={`size-7 rounded-full border text-xs transition ${
                active
                  ? "border-brand-600 bg-brand-600 font-medium text-white"
                  : "border-slate-300 text-slate-500 hover:border-brand-400 hover:bg-brand-50"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* One short note, not three, so a row stays on one line in a narrow column. */}
      {note && (
        <span className={`ml-1 truncate text-xs ${note.tone}`} title={note.full}>
          {note.text}
        </span>
      )}
    </li>
  );
}

function rowNote(answer: SheetAnswer, chosen: string | null, changed: boolean) {
  if (answer.state === "unsure" && !changed) {
    return { text: "two marks", tone: "text-amber-700", full: "Two bubbles looked filled" };
  }
  if (changed) {
    return { text: "changed", tone: "text-brand-700", full: "You changed this row" };
  }
  if (!chosen) {
    return { text: "blank", tone: "text-slate-400", full: "Nothing was marked" };
  }
  return null;
}

// Sri Lankan A/L answer sheets print their 50 bubbles as two columns of 25.
const BLOCK = 25;

/** Split the rows into blocks of 25, like the columns on a printed sheet. */
function inBlocks(answers: SheetAnswer[]): SheetAnswer[][] {
  const blocks: SheetAnswer[][] = [];
  for (let start = 0; start < answers.length; start += BLOCK) {
    blocks.push(answers.slice(start, start + BLOCK));
  }
  return blocks;
}

/** Saving is one request, but a slow one, so name what it is doing. */
function savingSteps(seconds: number, count: number): Step[] {
  return [
    {
      label: `Sending ${count} ${count === 1 ? "answer" : "answers"}`,
      detail: seconds > 0 ? `${spell(seconds)} so far` : undefined,
      state: seconds >= 1 ? "done" : "doing",
    },
    { label: "Saving them to your attempt", state: seconds >= 1 ? "doing" : "waiting" },
    { label: "Filling them into the questions below", state: "waiting" },
  ];
}

/** The three things the server does with a photo, so the wait is not a blank spinner. */
function readingSteps(seconds: number): Step[] {
  return [
    {
      label: "Photo sent",
      detail: seconds > 0 ? `${spell(seconds)} so far` : undefined,
      state: seconds >= 1 ? "done" : "doing",
    },
    { label: "Finding the answer bubbles", state: seconds >= 1 ? "doing" : "waiting" },
    { label: "Reading which ones are marked", state: "waiting" },
  ];
}

function hintFor(message: string): string | undefined {
  if (message.includes("bubbles") || message.includes("corner squares")) {
    return "Lay the sheet flat, fill the frame with it, and avoid shadows across the page.";
  }
  if (message.includes("under")) {
    return "Take the photo at a lower resolution, or crop it.";
  }
  if (message.includes("no multiple choice")) {
    return "This paper has no MCQ section, so there is no sheet to upload.";
  }
  return undefined;
}
