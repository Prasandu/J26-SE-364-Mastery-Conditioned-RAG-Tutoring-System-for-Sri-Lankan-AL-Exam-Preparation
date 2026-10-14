interface LoadingStateProps {
  label?: string;
}

export default function LoadingState({
  label = "Loading...",
}: LoadingStateProps) {
  return (
    <div
      aria-live="polite"
      className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm"
      role="status"
    >
      <span
        aria-hidden="true"
        className="mr-3 inline-block size-4 animate-spin rounded-full border-2 border-brand border-r-transparent align-[-3px]"
      />
      {label}
    </div>
  );
}
