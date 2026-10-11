import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="mt-20 px-4 pb-6 sm:px-6">
      <div className="mx-auto max-w-6xl rounded-[2rem] border border-white/70 bg-white/70 px-6 py-10 shadow-lg shadow-brand-900/5 backdrop-blur-xl sm:px-10">
        <div className="grid gap-8 text-sm sm:grid-cols-3">
          <div>
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              <Logo className="size-5 text-brand-600" />
              Intelligent Assessment
            </p>
            <p className="mt-2 text-slate-500">
              Marks A/L Chemistry answers point by point, and sends anything uncertain to a teacher.
            </p>
          </div>
          <div>
            <p className="font-medium text-slate-900">Research project</p>
            <p className="mt-2 text-slate-500">
              J26-SE-364, SLIIT
              <br />
              Supervisor: Ms. Suriyaa Kumari
            </p>
          </div>
          <div>
            <p className="font-medium text-slate-900">Please note</p>
            <p className="mt-2 text-slate-500">
              A research prototype. Marks here are not official and do not affect any school or
              G.C.E. (A/L) result.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
