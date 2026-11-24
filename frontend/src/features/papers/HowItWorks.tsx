import { SectionTitle } from "@/components/Hero";

const STEPS = [
  {
    title: "Answer",
    body: "Click the MCQs, type the written parts, or photograph what you wrote on paper.",
    icon: (
      <path
        d="M4 19h16M6 15.5 15.5 6a2.1 2.1 0 0 1 3 3L9 18.5l-4 1z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Marked point by point",
    body: "The answer key, a chemistry checker and an AI judge each decide the points they can.",
    icon: (
      <>
        <path
          d="M5 12.5 10 17l9-10"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.3" opacity="0.4" />
      </>
    ),
  },
  {
    title: "A teacher decides the rest",
    body: "Anything the markers disagree on waits for a person instead of being guessed.",
    icon: (
      <>
        <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M4.5 20a7.5 7.5 0 0 1 15 0"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </>
    ),
  },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how">
      <SectionTitle>
        <span id="how">How it works</span>
      </SectionTitle>

      <ul className="grid gap-5 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="rounded-3xl border border-white/70 bg-white/70 p-6 text-center shadow-lg shadow-brand-900/5 backdrop-blur-xl transition hover:-translate-y-1 hover:bg-white"
          >
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden="true">
                {step.icon}
              </svg>
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Step {index + 1}
            </p>
            <h3 className="mt-1 font-medium text-slate-900">{step.title}</h3>
            <p className="mt-2 text-sm/relaxed text-slate-600">{step.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
