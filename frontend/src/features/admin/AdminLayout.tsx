import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";

const SECTIONS = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/papers", label: "Papers & schemes", end: false },
  { to: "/admin/import", label: "Import a PDF", end: false },
  { to: "/admin/past-papers", label: "Past paper (PDF)", end: false },
  { to: "/admin/resources", label: "Resource books", end: false },
  { to: "/admin/suggestions", label: "Topic suggestions", end: false },
  { to: "/admin/generate", label: "Generate a paper", end: false },
  { to: "/admin/users", label: "Users Management", end: false },
];

/**
 * The admin area's own shell - a sidebar, not the site's top nav bar.
 *
 * Deliberately not the student/teacher Layout+NavBar: this is a workspace for
 * managing content (papers, schemes, resource books, topic tags), not a page in the
 * same flow a student or teacher moves through, so it should not look like one.
 */
export function AdminLayout({ onSignOut, children }: { readonly onSignOut: () => void; readonly children: ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="flex w-60 shrink-0 flex-col bg-slate-900 text-slate-200">
        <nav aria-label="Admin sections" className="flex-1 space-y-1 px-3 pt-5">
          {SECTIONS.map((section) => (
            <NavLink
              key={section.to}
              to={section.to}
              end={section.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm transition ${
                  isActive ? "bg-brand-600 font-medium text-white" : "text-slate-300 hover:bg-slate-800"
                }`
              }
            >
              {section.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 px-3 py-4">
          <NavLink to="/" className="block rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800">
            &larr; Back to the main site
          </NavLink>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="flex items-center gap-2.5">
            <Logo className="size-5 text-brand-600" />
            <p className="text-sm font-semibold tracking-tight text-slate-800">
              A/L Chemistry Assessment
            </p>
          </div>
          <AccountMenu user={user} onSignOut={onSignOut} />
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

function getInitials(name: string): string {
  if (!name) return "A";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A compact account indicator for the admin header - an initials avatar and a
 * sign-out icon, instead of the full "Signed in as..." text the student/teacher
 * NavBar shows. This is a workspace an admin stays in for a while, not a page
 * they are passing through, so the account area should stay out of the way. */
function AccountMenu({
  user,
  onSignOut,
}: {
  readonly user: { name: string; email: string } | null;
  readonly onSignOut: () => void;
}) {
  const label = user ? `${user.name} (${user.email})` : "Signed in with the admin key";
  const initials = user ? getInitials(user.name) : "A";

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white"
        title={label}
      >
        {initials}
      </div>
      <button
        type="button"
        onClick={onSignOut}
        aria-label="Sign out"
        title="Sign out"
        className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
          <path
            d="M7.5 3H4.5A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17h3M13 13.5l3.5-3.5m0 0L13 6.5m3.5 3.5H7.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
