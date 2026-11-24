import type { ReviewItem } from "@/api/types";

/**
 * What the camera read, beside the answer the student confirmed.
 *
 * Paper mode only. A lost mark can be the chemistry or the handwriting, and the
 * teacher cannot tell which without seeing both. Showing this is not peeking: it
 * says nothing about whether the mark should be given.
 */
export function MachineReading({ item }: { item: ReviewItem }) {
  const read = item.student_extracted_text;
  if (!read || read === item.student_text) {
    return null;
  }

  return (
    <div>
      <dt className="flex flex-wrap items-baseline gap-2 text-slate-500">
        <span>What the camera read</span>
        {item.corrected_by_student && (
          <span className="text-xs text-amber-700">the student corrected this</span>
        )}
      </dt>
      <dd className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-slate-600">
        {read}
      </dd>
    </div>
  );
}
