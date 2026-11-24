import { useRef, useState } from "react";

import { IMAGE_TYPES, uploadAnswerImage } from "@/api/attempts";
import { ApiError } from "@/api/client";
import type { AnswerOut } from "@/api/types";
import { Button } from "@/components/Button";
import { ErrorBox } from "@/components/ErrorBox";
import type { Step } from "@/components/Steps";
import { Steps } from "@/components/Steps";
import { spell, useElapsed } from "@/hooks/useElapsed";

interface Props {
  attemptId: string;
  questionId: number;
  disabled: boolean;
  onRead: (answer: AnswerOut) => void;
}

/**
 * Paper mode: photograph a handwritten answer and have a vision model read it.
 *
 * What comes back is a draft. The student checks it in the answer box and fixes
 * anything misread, so the marking is about their chemistry and not about the
 * model's reading.
 */
export function PhotoUpload({ attemptId, questionId, disabled, onRead }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  const seconds = useElapsed(busy);

  async function send(file: File) {
    if (!IMAGE_TYPES.includes(file.type)) {
      setError("Please choose a JPEG, PNG or WebP photo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const answer = await uploadAnswerImage(attemptId, questionId, file);
      setPages(answer.image_count);
      onRead(answer);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusy(false);
      if (input.current) {
        input.current.value = ""; // so the same file can be picked again
      }
    }
  }

  return (
    <div className="space-y-2">
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

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
        >
          {busy ? "Reading..." : "Upload a photo of your answer"}
        </Button>
        {pages > 0 && (
          <span className="text-xs text-slate-500">
            {pages} {pages === 1 ? "page" : "pages"} uploaded
          </span>
        )}
      </div>

      {busy && (
        <div className="rounded-xl bg-slate-50 p-4">
          <Steps steps={readingSteps(seconds)} />
          <p className="mt-3 text-xs text-slate-500">
            Reading handwriting takes longer than a typed answer, often 10 to 20 seconds.
          </p>
        </div>
      )}

      {error && <ErrorBox message={error} hint={hintFor(error)} />}
    </div>
  );
}

function readingSteps(seconds: number): Step[] {
  return [
    {
      label: "Photo sent",
      detail: seconds > 0 ? `${spell(seconds)} so far` : undefined,
      state: seconds >= 1 ? "done" : "doing",
    },
    { label: "Reading your handwriting", state: seconds >= 1 ? "doing" : "waiting" },
    { label: "Putting the text in the box for you to check", state: "waiting" },
  ];
}

function hintFor(message: string): string | undefined {
  if (message.includes("switched off")) {
    return "Set a vision model key in the service .env file, then restart it.";
  }
  if (message.includes("429") || message.toLowerCase().includes("quota")) {
    return "The free daily limit for reading pages is used up. Try again tomorrow, or type the answer.";
  }
  if (message.includes("under")) {
    return "Take the photo at a lower resolution, or crop it.";
  }
  return undefined;
}
