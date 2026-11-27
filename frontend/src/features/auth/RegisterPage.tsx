import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { useAuth } from "@/hooks/useAuth";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      if ((await register(email, name, password)) === "confirm-email") {
        setConfirmSent(true);
        setBusy(false);
        return;
      }
      navigate("/", { replace: true });
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : String(cause));
      setBusy(false);
    }
  }

  if (confirmSent) {
    return (
      <Card className="mx-auto max-w-md">
        <h1 className="text-lg font-medium">Check your email</h1>
        <p className="mt-2 text-sm text-slate-600">
          We sent a confirmation link to <span className="font-medium">{email}</span>. Open it, then sign in
          - the same account works for the lab, papers, study plan and tutor.
        </p>
        <p className="mt-5 text-center text-sm">
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Go to sign in
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md">
      <h1 className="text-lg font-medium">Create your account</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every new account is a student account - a teacher can give you a different role later.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="space-y-1">
          <label htmlFor="register-name" className="block text-sm text-slate-600">
            Your name
          </label>
          <input
            id="register-name"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="register-email" className="block text-sm text-slate-600">
            Email
          </label>
          <input
            id="register-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="register-password" className="block text-sm text-slate-600">
            Password
          </label>
          <input
            id="register-password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <p className="text-xs text-slate-400">At least 8 characters.</p>
        </div>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Creating your account..." : "Create account"}
        </Button>

        {problem && <ErrorBox message={problem} />}
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
