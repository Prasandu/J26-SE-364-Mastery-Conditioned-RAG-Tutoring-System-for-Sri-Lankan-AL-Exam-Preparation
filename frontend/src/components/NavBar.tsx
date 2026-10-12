import { useState } from "react";
import { NavLink } from "react-router-dom";

import { BackendStatus } from "./BackendStatus";
import { Logo } from "./Logo";

const LINKS = [
  { to: "/", label: "Papers", end: true },
  { to: "/practice", label: "Practice", end: false },
  { to: "/my-results", label: "My results", end: false },
  { to: "/review", label: "Teacher review", end: false },
  { to: "/about", label: "About", end: false },
];

export function NavBar() {
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 z-30 px-4 pt-4 sm:px-6">
      <header className="mx-auto max-w-6xl rounded-full border border-white/70 bg-white/80 px-3 py-2 shadow-lg shadow-brand-900/5 backdrop-blur-xl">
        <nav aria-label="Main" className="flex items-center gap-3">
          <NavLink to="/" className="flex items-center gap-2 px-2 text-brand-600">
            <Logo className="size-6" />
            <span className="font-semibold tracking-tight text-slate-900">
              A/L Chemistry <span className="hidden text-slate-400 lg:inline">Assessment</span>
            </span>
          </NavLink>

          {/* Pills, with the current page filled in. */}
          <ul className="ml-4 hidden items-center gap-1 md:flex">
            {LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `rounded-full px-4 py-2 text-sm transition ${
                      isActive
                        ? "bg-brand-600 font-medium text-white shadow-md shadow-brand-600/25"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="ml-auto flex items-center gap-2">
            <BackendStatus />
            <button
              type="button"
              aria-expanded={open}
              aria-label="Menu"
              onClick={() => setOpen(!open)}
              className="rounded-full p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
                <path
                  d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"}
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </nav>

        {open && (
          <ul className="mt-2 border-t border-slate-200/70 px-1 pt-2 md:hidden">
            {LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-full px-4 py-2.5 text-sm ${
                      isActive ? "bg-brand-600 font-medium text-white" : "text-slate-700"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </header>
    </div>
  );
}
