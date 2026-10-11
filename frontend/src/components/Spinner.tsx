export function Spinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-slate-500" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand-400" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/** Grey blocks in the shape of what is coming, so the page does not jump. */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-44 animate-pulse rounded-3xl bg-white/60" />
      ))}
    </div>
  );
}
