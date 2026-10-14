import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { useAuth } from "@/hooks/useAuth";

/** Where to send a signed-in user back to, if they were sent here to sign in first. */
function returnTo(search: string): string {
  return new URLSearchParams(search).get("next") || "/";
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await login(email, password);
      navigate(returnTo(location.search), { replace: true });
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : String(cause));
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md">
      <h1 className="text-lg font-medium">Sign in</h1>
      <p className="mt-1 text-sm text-slate-500">
        One account works everywhere - practising, answering a paper, and seeing your own results.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="space-y-1">
          <label htmlFor="login-email" className="block text-sm text-slate-600">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="login-password" className="block text-sm text-slate-600">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Signing in..." : "Sign in"}
        </Button>

        {problem && <ErrorBox message={problem} />}
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">
        No account yet?{" "}
        <Link to="/register" className="font-medium text-brand-600 hover:underline">
          Sign up
        </Link>
      </p>
    </Card>
  );
}
