import { useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { friendlySignInError, SETUP_PROBLEM_MESSAGE } from "./authMessages";

interface LoginPanelProps {
  configurationError?: string;
  authError?: string;
}

function FlaskIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M9 3h6M10 3v6.2L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.2V3M7.5 15h9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7">
        {children}
      </g>
    </svg>
  );
}

const benefits = [
  {
    title: "Starts from what you know",
    text: "Your results show which topics need work and which carry the most exam marks.",
    icon: <Icon><path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6" /></Icon>,
  },
  {
    title: "Plans around your life",
    text: "Study times that fit your week, a session timer, gentle reminders, and a plan that adjusts if you miss a day.",
    icon: <Icon><path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></Icon>,
  },
  {
    title: "Shows your progress",
    text: "See your strongest and weakest units, your predicted grade, and always why each session was chosen.",
    icon: <Icon><path d="M5 13l4 4L19 7" /></Icon>,
  },
];

/**
 * Student sign-in page: a short introduction to the planner on the left and the
 * sign-in form on the right (stacked on phones).
 */
export default function LoginPanel({
  configurationError = "",
  authError = "",
}: LoginPanelProps) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (cause) {
      setError(
        friendlySignInError(
          cause instanceof Error ? cause.message : "Sign-in didn't work.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const alert = "break-words rounded-2xl bg-rose-50 p-3 text-sm text-rose-900";

  return (
    <div className="flex min-h-screen flex-col px-4 pb-6 pt-4 sm:px-6">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-[1.75rem] border border-slate-100 bg-white px-4 py-2.5 shadow-card">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-brand-soft text-brand">
            <FlaskIcon />
          </span>
          <p className="text-base font-semibold text-ink">
            A/L Chemistry <span className="text-sm font-normal text-slate-500">Planner</span>
          </p>
        </div>
        <p className="hidden text-sm text-slate-500 sm:block">Your study plan to exam day</p>
      </header>

      {/* The card is centred in the space under the top bar, so there is no big empty gap below it. */}
      <div className="flex flex-1 items-center py-6">
        <main className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-card lg:min-h-[36rem] lg:grid-cols-[1.15fr_1fr]">
          <aside className="relative order-2 flex items-center overflow-hidden bg-brand p-8 text-white sm:p-10 lg:order-1 lg:p-12">
            <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-24 -left-12 size-56 rounded-full bg-white/5" />
            <div className="relative w-full">
              <h1 className="text-3xl font-bold leading-tight lg:text-4xl">
                Your A/L Chemistry study plan, built around you.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-white/85">
                Know what to study next, when to study it, and why. Your plan grows
                with your results all the way to exam day.
              </p>
              <ul className="mt-8 space-y-5">
                {benefits.map((benefit) => (
                  <li className="flex gap-4" key={benefit.title}>
                    <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-white/15">
                      {benefit.icon}
                    </span>
                    <div>
                      <p className="text-base font-semibold">{benefit.title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-white/80">{benefit.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          <section className="order-1 flex items-center justify-center p-8 sm:p-10 lg:order-2 lg:p-12">
            <div className="w-full max-w-sm">
              <span className="chip">Student sign-in</span>
              <h2 className="mt-3 text-2xl font-bold text-ink sm:text-3xl">Sign in to continue</h2>
              <p className="mt-2 text-sm text-slate-600">
                Use your A/L Chemistry student account to open your study plan and
                progress.
              </p>

              {configurationError ? (
                <div aria-live="assertive" className={`mt-5 ${alert}`} role="alert">
                  <p className="font-semibold">{SETUP_PROBLEM_MESSAGE}</p>
                  <p className="mt-1 text-xs opacity-80">Details: {configurationError}</p>
                </div>
              ) : null}
              {error ? (
                <p aria-live="assertive" className={`mt-5 ${alert}`} role="alert">
                  {error}
                </p>
              ) : null}
              {authError ? (
                <p aria-live="assertive" className={`mt-5 ${alert}`} role="alert">
                  {authError}
                </p>
              ) : null}

              {!configurationError ? (
                <form className="mt-6 space-y-4" onSubmit={submit}>
                  <label className="block text-sm font-medium text-slate-700">
                    Email
                    <input
                      autoComplete="email"
                      autoFocus
                      className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-3 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      required
                      type="email"
                      value={email}
                    />
                  </label>
                  <div>
                    <label className="block text-sm font-medium text-slate-700" htmlFor="sign-in-password">
                      Password
                    </label>
                    <div className="relative mt-2">
                      <input
                        autoComplete="current-password"
                        className="w-full rounded-xl border border-slate-300 py-3 pl-3.5 pr-16 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                        id="sign-in-password"
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        type={showPassword ? "text" : "password"}
                        value={password}
                      />
                      <button
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-xs font-semibold text-brand hover:bg-brand-soft"
                        onClick={() => setShowPassword((visible) => !visible)}
                        type="button"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                  <button
                    className="w-full rounded-full bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                    disabled={submitting}
                    type="submit"
                  >
                    {submitting ? "Signing in..." : "Sign in"}
                  </button>
                </form>
              ) : null}

              <p className="mt-6 text-center text-xs text-slate-500">
                No account yet? Ask your teacher or admin to create one for you.
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
