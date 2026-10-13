import { useEffect, useState } from "react";

import { answerImage } from "@/api/review";
import type { ReviewItem } from "@/api/types";

/**
 * The student's own photos, for a teacher marking what the reader could not read.
 *
 * A diagram point goes to a teacher precisely because no machine can mark a drawing,
 * so the teacher has to see the drawing. Showing it is not peeking at the machine's
 * opinion: the photo says nothing about whether the mark should be given.
 *
 * Fetched rather than linked because the teacher key travels in a header, which an
 * <img src> cannot send.
 */
export function AnswerPhotos({ item }: { readonly item: ReviewItem }) {
  const ids = item.image_ids;
  const key = ids.join(","); // a new array every render would reload the photos every render
  const [urls, setUrls] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const wanted = key ? key.split(",").map(Number) : [];
    if (wanted.length === 0) {
      return;
    }
    let made: string[] = [];
    const stop = new AbortController();

    Promise.all(wanted.map((id) => answerImage(id, stop.signal)))
      .then((blobs) => {
        if (stop.signal.aborted) {
          return; // left the point while loading; nothing to show and nothing to clean up
        }
        made = blobs.map((blob) => URL.createObjectURL(blob));
        setUrls(made);
      })
      .catch((cause: unknown) => {
        if (!stop.signal.aborted) {
          setProblem(cause instanceof Error ? cause.message : String(cause));
        }
      });

    return () => {
      stop.abort();
      made.forEach((url) => URL.revokeObjectURL(url)); // the browser keeps these until told
    };
  }, [key]);

  if (ids.length === 0) {
    return null;
  }

  return (
    <div>
      <dt className="flex flex-wrap items-baseline gap-2 text-slate-500">
        <span>{ids.length === 1 ? "The student's photo" : `The student's ${ids.length} photos`}</span>
        {item.has_drawing && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
            contains a drawing the reader could not write out
          </span>
        )}
      </dt>
      <dd className="mt-1 space-y-2">
        {problem && <p className="text-xs text-rose-700">Could not load the photo: {problem}</p>}
        {urls.map((url, index) => (
          <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
            <img
              src={url}
              alt={`Page ${index + 1} of the student's handwritten answer`}
              className="max-h-96 w-full rounded-lg border border-slate-200 object-contain"
            />
          </a>
        ))}
      </dd>
    </div>
  );
}
