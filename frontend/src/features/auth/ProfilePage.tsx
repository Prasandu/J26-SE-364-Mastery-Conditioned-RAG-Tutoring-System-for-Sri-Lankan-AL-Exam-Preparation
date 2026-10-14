import { useState } from "react";

import { changePassword, updateProfile } from "@/api/auth";
import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { Hero } from "@/components/Hero";
import { useAuth } from "@/hooks/useAuth";

/** Gated by RequireAuth in App.tsx (no role needed - any signed-in account). */
export function ProfilePage() {
  const { user } = useAuth();
  if (!user) {
    return null; // RequireAuth guarantees this never actually happens
  }

  return (
    <div className="space-y-5">
      <Hero eyebrow="Account" title="Your profile">
        <p>Signed in as {user.email}.</p>
      </Hero>

      <div className="grid gap-5 lg:grid-cols-2">
        <NameCard name={user.name} email={user.email} role={user.role} />
        <PasswordCard />
      </div>
    </div>
  );
}

function NameCard({ name, email, role }: { readonly name: string; readonly email: string; readonly role: string }) {
  const { refreshUser } = useAuth();
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setSaved(false);
    try {
      await updateProfile(value.trim());
      await refreshUser();
      setSaved(true);
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="font-medium">Your details</h2>

      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-slate-500">Email</dt>
          <dd className="text-slate-800">{email}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Role</dt>
          <dd className="capitalize text-slate-800">{role}</dd>
        </div>
      </dl>

      <form onSubmit={save} className="mt-5 space-y-3 border-t border-slate-100 pt-4">
        <div className="space-y-1">
          <label htmlFor="profile-name" className="block text-sm text-slate-600">
            Your name
          </label>
          <input
            id="profile-name"
            required
            maxLength={100}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setSaved(false);
            }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>

        <Button type="submit" disabled={busy || value.trim() === name} className="w-full">
          {busy ? "Saving..." : "Save name"}
        </Button>

        {saved && <p className="text-sm text-brand-700">Saved.</p>}
        {problem && <ErrorBox message={problem} />}
      </form>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setSaved(false);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setSaved(true);
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="font-medium">Change your password</h2>
      <p className="mt-1 text-sm text-slate-500">
        Your current password is needed, even though you are already signed in.
      </p>

      <form onSubmit={save} className="mt-4 space-y-3">
        <div className="space-y-1">
          <label htmlFor="current-password" className="block text-sm text-slate-600">
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            required
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="new-password" className="block text-sm text-slate-600">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            required
            minLength={8}
            value={next}
            onChange={(event) => setNext(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <p className="text-xs text-slate-400">At least 8 characters.</p>
        </div>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Changing..." : "Change password"}
        </Button>

        {saved && <p className="text-sm text-brand-700">Password changed.</p>}
        {problem && <ErrorBox message={problem} />}
      </form>
    </Card>
  );
}
