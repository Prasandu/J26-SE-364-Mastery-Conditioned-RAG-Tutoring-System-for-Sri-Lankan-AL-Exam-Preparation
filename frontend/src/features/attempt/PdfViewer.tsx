import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import { ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";

// Vite bundles the worker file itself and gives us a URL to it, rather than
// fetching it from a CDN - keeps the viewer working offline/without a third party.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.2;
const DEFAULT_SCALE = 1.1;

/**
 * The real exam PDF, shown directly instead of a transcription - a toolbar for
 * zoom, and every page stacked so the student scrolls through it like a document.
 * No text/annotation layer: this is a past exam scan, not something to select text
 * from, and skipping it keeps rendering fast.
 */
export function PdfViewer({ fileUrl }: { readonly fileUrl: string }) {
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setScale((current) => Math.max(MIN_SCALE, Number((current - SCALE_STEP).toFixed(2))))}
            disabled={scale <= MIN_SCALE}
            aria-label="Zoom out"
            className="flex size-7 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-white disabled:opacity-40"
          >
            &minus;
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-slate-500">
            {Math.round((scale / DEFAULT_SCALE) * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((current) => Math.min(MAX_SCALE, Number((current + SCALE_STEP).toFixed(2))))}
            disabled={scale >= MAX_SCALE}
            aria-label="Zoom in"
            className="flex size-7 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-white disabled:opacity-40"
          >
            +
          </button>
        </div>
        {numPages > 0 && (
          <span className="text-xs text-slate-500">
            {numPages} page{numPages === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto bg-slate-100 p-4">
        {problem && <ErrorBox message={problem} hint="Try reloading the page." />}
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages: loaded }) => setNumPages(loaded)}
          onLoadError={(error) => setProblem(error.message)}
          loading={<Spinner label="Loading the paper..." />}
          className="flex flex-col items-center gap-4"
        >
          {Array.from({ length: numPages }, (_, index) => (
            <Page
              key={index}
              pageNumber={index + 1}
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="shadow-md"
            />
          ))}
        </Document>
      </div>
    </div>
  );
}
