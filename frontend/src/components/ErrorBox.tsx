export function ErrorBox({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4" role="alert">
      <p className="font-medium text-rose-800">{message}</p>
      {hint && <p className="mt-1 text-sm text-rose-700">{hint}</p>}
    </div>
  );
}
