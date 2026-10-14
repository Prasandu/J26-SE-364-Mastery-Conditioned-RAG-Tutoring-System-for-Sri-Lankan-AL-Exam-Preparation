import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { hasRole } from "@/lib/role";

import { BackendStatus } from "./BackendStatus";
import { Logo } from "./Logo";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

export function NavBar() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  // Role-appropriate navigation:
  // - Students: Home, Papers, Practice, My results, About (Teacher review hidden)
  // - Teachers: Home, Papers, Practice, Teacher review, About
  // - Admins: Home, Papers, Practice, Teacher review, Admin dashboard, About
  //   (Admin dashboard is its own shell with its own sidebar - see AdminLayout -
  //   so Generate and the other admin tools live inside it, not as top-nav pills.)
  // - Unauthenticated: standard links
  const links: NavItem[] = [
    { to: "/", label: "Home", end: true },
    { to: "/papers", label: "Papers", end: false },
    ...(!user || user.role === "student" ? [{ to: "/practice", label: "Practice", end: false }] : []),
    ...(!user || user.role === "student" ? [{ to: "/my-results", label: "My results", end: false }] : []),
    ...(!user || hasRole(user.role, "teacher") ? [{ to: "/review", label: "Teacher review", end: false }] : []),
    ...(user && hasRole(user.role, "admin") ? [{ to: "/admin", label: "Admin dashboard", end: false }] : []),
    { to: "/about", label: "About", end: false },
  ];

  return (
    <div className="sticky top-0 z-30 px-3 pt-3 sm:px-6 sm:pt-4">
      <header className="mx-auto max-w-7xl rounded-full border border-slate-200/80 bg-white/90 px-3 py-1.5 shadow-md shadow-brand-900/5 backdrop-blur-xl sm:px-4 sm:py-2">
        <nav aria-label="Main" className="flex items-center gap-2 sm:gap-4">
          <NavLink
            to="/"
            className="flex shrink-0 items-center gap-2.5 px-1 py-1 text-brand-600 transition hover:opacity-90"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
              <Logo className="size-4.5" />
            </div>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-sm font-semibold tracking-tight text-slate-900 sm:text-base">
                A/L Chemistry
              </span>
              <span className="hidden text-xs font-medium text-slate-400 lg:inline">
                Assessment
              </span>
            </div>
          </NavLink>

          {/* Navigation links pills */}
          <ul className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex">
            {links.map((link) => (
              <li key={link.to} className="shrink-0">
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-150 lg:px-3.5 lg:text-sm ${
                      isActive
                        ? "bg-brand-600 text-white shadow-md shadow-brand-600/25"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            <BackendStatus />
            <AccountArea />
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
          <div className="mt-2 border-t border-slate-200/70 px-2 pt-3 pb-2 md:hidden">
            <ul className="flex flex-col gap-1">
              {links.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.end}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                        isActive
                          ? "bg-brand-600 text-white"
                          : "text-slate-700 hover:bg-slate-100"
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-slate-200/70 pt-3">
              <MobileAccountArea onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}
      </header>
    </div>
  );
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Sign in / register, or the signed-in account with a way to sign out. */
function AccountArea() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return null;
  }

  // Home, not just clearing the session in place - otherwise signing out from a
  // protected page (e.g. an attempt's results) leaves you on that same URL,
  // which RequireAuth immediately bounces to /login?next=<that page>. Whoever
  // then signs in next - even a different role - would get sent straight back
  // into a page that was never theirs.
  function signOut() {
    logout();
    navigate("/", { replace: true });
  }

  if (!user) {
    return (
      <div className="hidden items-center gap-1.5 sm:flex">
        <NavLink
          to="/login"
          className="rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition whitespace-nowrap"
        >
          Sign in
        </NavLink>
        <NavLink
          to="/register"
          className="rounded-full bg-brand-600 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-white shadow-xs hover:bg-brand-700 active:scale-[0.98] transition whitespace-nowrap"
        >
          Sign up
        </NavLink>
      </div>
    );
  }

  const initials = getInitials(user.name);

  return (
    <div className="hidden items-center gap-2 sm:flex">
      <NavLink
        to="/profile"
        className="group flex items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50/80 py-1 pl-1.5 pr-3 text-xs text-slate-700 shadow-xs hover:border-brand-300 hover:bg-white hover:text-brand-700 hover:shadow-sm transition-all whitespace-nowrap shrink-0"
        title={`${user.name} (${user.role})`}
      >
        <div className="flex size-6.5 shrink-0 items-center justify-center rounded-full bg-brand-600 font-semibold text-[11px] text-white shadow-xs">
          {initials}
        </div>
        <span className="font-medium max-w-[120px] lg:max-w-[150px] truncate text-slate-800 group-hover:text-brand-700">
          {user.name}
        </span>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700 border border-brand-200/60">
          {user.role}
        </span>
      </NavLink>
      <button
        type="button"
        onClick={signOut}
        className="group flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-xs hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition-all whitespace-nowrap shrink-0"
        title="Sign out"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className="size-3.5 text-slate-400 group-hover:text-rose-500 transition-colors"
          aria-hidden="true"
        >
          <path
            d="M7.5 3H4.5A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17h3M13 13.5l3.5-3.5m0 0L13 6.5m3.5 3.5H7.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Sign out</span>
      </button>
    </div>
  );
}

function MobileAccountArea({ onNavigate }: { readonly onNavigate: () => void }) {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return null;
  }

  function signOut() {
    logout();
    navigate("/", { replace: true });
    onNavigate();
  }

  if (!user) {
    return (
      <div className="flex gap-2">
        <NavLink
          to="/login"
          onClick={onNavigate}
          className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          Sign in
        </NavLink>
        <NavLink
          to="/register"
          onClick={onNavigate}
          className="flex-1 rounded-full bg-brand-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-brand-700 transition"
        >
          Sign up
        </NavLink>
      </div>
    );
  }

  const initials = getInitials(user.name);

  return (
    <div className="flex flex-col gap-3">
      <NavLink
        to="/profile"
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-2xl bg-slate-50 p-2.5 transition hover:bg-slate-100"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 font-semibold text-xs text-white">
          {initials}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900 text-sm truncate">{user.name}</span>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700 border border-brand-200/60">
              {user.role}
            </span>
          </div>
          <span className="text-xs text-slate-400 truncate">{user.email}</span>
        </div>
      </NavLink>
      <button
        type="button"
        onClick={signOut}
        className="flex items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition"
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
        <span>Sign out</span>
      </button>
    </div>
  );
}