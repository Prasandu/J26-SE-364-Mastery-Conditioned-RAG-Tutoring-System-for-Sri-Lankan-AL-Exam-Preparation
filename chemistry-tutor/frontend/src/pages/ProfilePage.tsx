import { useAuth } from "../contexts/AuthContext";

export function ProfilePage() {
  const { user, signOut } = useAuth();

  if (!user) return null;

  const createdAt = user.created_at ? new Date(user.created_at).toLocaleString() : "—";

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="mx-auto max-w-md">
        <h1 className="mb-4 text-lg font-semibold text-blue-950">Profile</h1>

        <div className="rounded-lg border bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-950 text-lg font-semibold text-white">
              {user.email?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">{user.email}</p>
              <p className="text-xs text-slate-400">Student account</p>
            </div>
          </div>

          <dl className="mt-5 space-y-2 border-t pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">User ID</dt>
              <dd className="font-mono text-xs text-slate-700">{user.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Account created</dt>
              <dd className="text-slate-700">{createdAt}</dd>
            </div>
          </dl>

          <button
            onClick={signOut}
            className="mt-5 w-full rounded bg-blue-800 px-3 py-2 text-sm text-white hover:bg-blue-900"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
