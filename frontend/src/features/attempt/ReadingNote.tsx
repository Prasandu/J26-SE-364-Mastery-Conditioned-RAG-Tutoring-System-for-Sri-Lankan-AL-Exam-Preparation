import type { AnswerOut } from "@/api/types";

// How well the photo was read, as a state the student can act on. Which reader ran
// and how sure it was are the service's business, not something a student can do
// anything about, so neither is shown here.
const LOW_CONFIDENCE = 0.8;

/** Whether the photo was read cleanly, and what the student still has to check. */
export function ReadingNote({ answer }: { answer: AnswerOut }) {
  if (!answer.reader) {
    return null;
  }
  const sure = answer.reading_confidence;
  const unclear = (sure !== null && sure < LOW_CONFIDENCE) || answer.text?.includes("[?]");

  return (
    <div
      className={`rounded-lg p-3 text-xs ${
        unclear ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"
      }`}
    >
      <p className="font-medium">
        {unclear ? "Some parts could not be read clearly" : "Your writing was read successfully"}
      </p>
      <p className="mt-1">
        {unclear ? (
          <>
            Please check the text below and fix anything that is wrong before you submit. Anything
            marked <span className="font-mono">[?]</span> could not be read.
          </>
        ) : (
          <>Please read it through and correct anything that is wrong before you submit.</>
        )}
      </p>
      {answer.has_drawing && (
        <p className="mt-1">
          Your answer has a drawing in it. Leave the{" "}
          <span className="font-mono">[drawing: ...]</span> line as it is - a teacher marks the
          drawing from your photo, so you do not have to describe it yourself.
        </p>
      )}
      {answer.corrected_by_student && (
        <p className="mt-1 font-medium">You have corrected this transcription.</p>
      )}
    </div>
  );
}
