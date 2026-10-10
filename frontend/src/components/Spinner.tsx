export function Spinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-slate-500" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-teal-600" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
