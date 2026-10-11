import { Link, Outlet } from "react-router-dom";

import { BackendStatus } from "./BackendStatus";

export function Layout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="font-semibold tracking-tight">
              A/L Chemistry Assessment
            </Link>
            <Link to="/review" className="text-sm text-slate-500 hover:text-teal-700">
              Teacher review
            </Link>
          </div>
          <BackendStatus />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
