import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";

interface LoginPanelProps {
  configurationError?: string;
  authError?: string;
}

export default function LoginPanel({
  configurationError = "",
  authError = "",
}: LoginPanelProps) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(configurationError);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Supabase sign-in failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">
        Planning
      </p>
      <h2 className="mt-2 text-2xl font-bold text-ink">Sign in to continue</h2>
      <p className="mt-2 text-sm text-slate-600">
        Use your Supabase-authenticated student account to access your plan and
        progress.
      </p>
      {error ? (
        <p
          aria-live="assertive"
          className="mt-4 break-words rounded-lg bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {authError ? (
        <p
          aria-live="assertive"
          className="mt-4 break-words rounded-lg bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {authError}
        </p>
      ) : null}
      {!configurationError ? (
        <form className="mt-5 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              autoComplete="email"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              autoComplete="current-password"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button
            className="w-full rounded-lg bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
