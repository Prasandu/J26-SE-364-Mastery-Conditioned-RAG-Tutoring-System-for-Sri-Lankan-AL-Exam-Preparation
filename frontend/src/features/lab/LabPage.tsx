import { Card } from "@/components/Card";

// Component 1 - Intelligent Virtual Chemistry Laboratory. Its 3D workbench is its
// own app (apps/web: pnpm workspace, React Three Fiber and the deterministic
// simulation core in packages/simulation-core), so this page opens it rather than
// re-hosting it here.
const LAB_URL = import.meta.env.VITE_LAB_URL ?? "http://localhost:5174";

export function LabPage() {
  return (
    <Card className="mx-auto max-w-3xl">
      <p className="text-xs font-semibold tracking-widest text-brand-600 uppercase">Virtual Chemistry Lab</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Practise NIE practicals before the real lab</h1>
      <p className="mt-3 text-sm text-slate-600">
        Work through official NIE practical handbook experiments in a 3D laboratory, in English or Sinhala, in
        automatic, guided or manual mode. The simulation checks each step - safety, technique, measurement and
        completeness - and keeps a lab notebook and a practical competency estimate.
      </p>
      <p className="mt-3 text-sm text-slate-500">
        AI assistance in the lab is not laboratory safety certification or a substitute for supervised practical
        work.
      </p>
      <a
        href={LAB_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-6 inline-flex items-center rounded-full bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
      >
        Open the Virtual Lab
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </Card>
  );
}
