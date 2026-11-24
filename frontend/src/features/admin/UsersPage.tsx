import { useCallback, useState } from "react";

import { createUser, listUsers, updateUserRole, updateUserStatus } from "@/api/admin";
import { ApiError } from "@/api/client";
import type { AdminUser, UserRole } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState, ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { useApi } from "@/hooks/useApi";

const ROLES: UserRole[] = ["student", "teacher", "admin"];

export function UsersPage() {
  const load = useCallback((signal: AbortSignal) => listUsers(signal), []);
  const { data: users, error, loading, reload } = useApi(load, []);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "student" as UserRole });
  const [creating, setCreating] = useState(false);

  async function changeRole(user: AdminUser, role: UserRole) {
    if (role === user.role) return;
    setBusyId(user.id);
    setActionError(null);
    try {
      await updateUserRole(user.id, role);
      reload();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(user: AdminUser) {
    setBusyId(user.id);
    setActionError(null);
    try {
      await updateUserStatus(user.id, !user.is_active);
      reload();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setActionError(null);
    try {
      await createUser(form);
      setForm({ email: "", name: "", password: "", role: "student" });
      reload();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">User management</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage account roles and access. New registrations are students by default.
        </p>
      </div>

      {actionError && <ErrorBox message={actionError} />}
      {error && <ErrorBox message={error} />}
      {loading && <Spinner label="Loading users..." />}

      <Card>
        <h2 className="text-base font-semibold text-slate-900">Create an account</h2>
        <form onSubmit={(event) => void submitCreate(event)} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            required
            type="text"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Full name"
            aria-label="Full name"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <input
            required
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="Email address"
            aria-label="Email address"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <input
            required
            minLength={8}
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder="Temporary password"
            aria-label="Temporary password"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <select
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
            aria-label="Account role"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none"
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create account"}
          </Button>
        </form>
      </Card>

      {users?.length === 0 && <EmptyState title="No user accounts">Registered accounts will appear here.</EmptyState>}

      {users && users.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="align-middle">
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">{user.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{user.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <label>
                        <span className="sr-only">Role for {user.name}</span>
                        <select
                          value={user.role}
                          disabled={busyId === user.id}
                          onChange={(event) => void changeRole(user, event.target.value as UserRole)}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-brand-500 focus:outline-none"
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </label>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={user.is_active ? "good" : "neutral"}>
                        {user.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button
                        variant="secondary"
                        disabled={busyId === user.id}
                        onClick={() => void changeStatus(user)}
                      >
                        {user.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
