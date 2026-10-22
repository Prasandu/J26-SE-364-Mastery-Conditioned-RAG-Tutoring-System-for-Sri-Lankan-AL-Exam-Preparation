import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Mode = "login" | "register";

export function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredMessage, setRegisteredMessage] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setRegisteredMessage(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setRegisteredMessage(null);

    try {
      if (mode === "register") {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setRegisteredMessage("Account created — you're logged in.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Branding panel — hidden on narrow screens */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-blue-950 p-10 text-white lg:flex">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-800/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-blue-700/30 blur-3xl" />

        <div className="relative">
          <p className="text-xs font-semibold tracking-widest text-blue-300 uppercase">
            G.C.E. Advanced Level Chemistry
          </p>
          <h1 className="mt-3 max-w-sm text-3xl font-bold leading-tight">
            Mastery-Conditioned RAG Tutoring System
          </h1>
          <p className="mt-4 max-w-sm text-sm text-blue-100">
            A bilingual AI Chemistry tutor built around what you actually got wrong — grounded
            answers, step-by-step hints, and progress you can see.
          </p>
        </div>

        <ul className="relative space-y-3 text-sm text-blue-100">
          <BrandBullet>Curriculum-grounded answers with citations</BrandBullet>
          <BrandBullet>Progressive hints instead of straight answers</BrandBullet>
          <BrandBullet>Dashboard, consultation and Wivarana reports</BrandBullet>
        </ul>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-1 items-center justify-center px-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden">
            <h1 className="text-lg font-semibold text-blue-950">
              Mastery-Conditioned RAG Tutoring System
            </h1>
          </div>

          <div className="mb-6 flex rounded-lg bg-slate-100 p-1 text-sm">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`flex-1 rounded-md py-2 font-medium transition ${
                mode === "login" ? "bg-white text-blue-950 shadow-sm" : "text-slate-500"
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`flex-1 rounded-md py-2 font-medium transition ${
                mode === "register" ? "bg-white text-blue-950 shadow-sm" : "text-slate-500"
              }`}
            >
              Register
            </button>
          </div>

          <h2 className="text-xl font-semibold text-slate-900">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "login"
              ? "Log in to continue your Chemistry practice."
              : "Takes less than a minute — no email confirmation needed."}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-600">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-medium text-slate-600">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-16 text-sm outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-blue-800 hover:text-blue-950"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {mode === "register" && (
                <p className="mt-1 text-xs text-slate-400">At least 6 characters.</p>
              )}
            </div>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            {registeredMessage && (
              <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                {registeredMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-lg bg-blue-800 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-blue-900 disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Please wait...
                </span>
              ) : mode === "login" ? (
                "Log In"
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            {mode === "login" ? "Need an account?" : "Already have an account?"}{" "}
            <button
              onClick={() => switchMode(mode === "login" ? "register" : "login")}
              className="font-medium text-blue-800 hover:underline"
            >
              {mode === "login" ? "Register" : "Log in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function BrandBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-blue-300">
        <path
          fillRule="evenodd"
          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
          clipRule="evenodd"
        />
      </svg>
      {children}
    </li>
  );
}
