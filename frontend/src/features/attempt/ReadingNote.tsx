import type { AnswerOut } from "@/api/types";

/** What the model read, how sure it was, and a reminder to check it. */
export function ReadingNote({ answer }: { answer: AnswerOut }) {
  if (!answer.reader) {
    return null;
  }
  const sure = answer.reading_confidence;
  const low = sure !== null && sure < 0.8;

  return (
    <div
      className={`rounded-lg p-3 text-xs ${low ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600"}`}
    >
      <p>
        Read by <span className="font-mono">{answer.reader}</span>
        {sure !== null && `, ${Math.round(sure * 100)}% sure`}.{" "}
        <strong>Please read it through and fix anything it got wrong</strong> before you submit.
        Anything marked <span className="font-mono">[?]</span> could not be read.
      </p>
      {answer.corrected_by_student && (
        <p className="mt-1 text-teal-700">You have corrected this transcription.</p>
      )}
    </div>
  );
}
