interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      aria-live="assertive"
      className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800"
      role="alert"
    >
      <p className="font-semibold">We couldn't load this information.</p>
      <p className="mt-1 break-words text-sm">{message}</p>
      {onRetry ? (
        <button
          className="mt-4 rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white hover:bg-red-900"
          onClick={onRetry}
          type="button"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
