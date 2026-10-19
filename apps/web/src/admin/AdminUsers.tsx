import type { AdminUser, AdminUserRequest } from '@vlab/contracts';
import { useCallback, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusMessage } from '../components/ui/StatusMessage';
import type { AdminClient } from './adminClient';
import { errorKey, useAdminData } from './useAdminData';

const ROLES = ['student', 'teacher', 'admin'] as const;
const STATUSES = ['active', 'disabled'] as const;
const ERRORS = new Set(['invalid_request', 'draft_version_conflict', 'network_unavailable']);

const blank: AdminUserRequest = {
  expectedVersion: null,
  displayName: '',
  role: 'student',
  status: 'active',
  note: '',
};

function UserRow({
  user,
  busy,
  onSave,
}: {
  user: AdminUser;
  busy: boolean;
  onSave: (user: AdminUser, change: Partial<AdminUserRequest>) => void;
}) {
  const { t } = useTranslation();
  return (
    <tr>
      <th scope="row">{user.displayName}</th>
      <td>
        <label className="visually-hidden" htmlFor={`role-${user.id}`}>
          {t('admin.users.role')}
        </label>
        <select
          id={`role-${user.id}`}
          value={user.role}
          disabled={busy}
          onChange={(e) => onSave(user, { role: e.target.value as AdminUser['role'] })}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`admin.users.roles.${r}`)}
            </option>
          ))}
        </select>
      </td>
      <td>
        <label className="visually-hidden" htmlFor={`status-${user.id}`}>
          {t('admin.users.status')}
        </label>
        <select
          id={`status-${user.id}`}
          value={user.status}
          disabled={busy}
          onChange={(e) => onSave(user, { status: e.target.value as AdminUser['status'] })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`admin.users.statuses.${s}`)}
            </option>
          ))}
        </select>
      </td>
      <td>{user.note || '—'}</td>
    </tr>
  );
}

/**
 * User directory while there is no login: pseudonymous names and roles that are recorded but not
 * enforced, plus read-only learner data from this server process.
 */
export function AdminUsers({ client }: { client: AdminClient }) {
  const { t } = useTranslation();
  const load = useCallback(() => client.users(), [client]);
  const { state, reload } = useAdminData(load);
  const [form, setForm] = useState<AdminUserRequest>(blank);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; key: string } | null>(null);

  if (state.status === 'loading')
    return <StatusMessage tone="loading" title={t('admin.loading')} />;
  if (state.status === 'error')
    return <StatusMessage tone="error" title={t('admin.error.generic')} />;

  const run = async (op: () => Promise<unknown>, successKey: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await op();
      setMessage({ tone: 'success', key: successKey });
      reload();
    } catch (error) {
      setMessage({ tone: 'error', key: errorKey(error, ERRORS) });
    } finally {
      setBusy(false);
    }
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await client.createUser(form);
      setForm(blank);
    }, 'admin.users.created');
  };
  const save = (user: AdminUser, change: Partial<AdminUserRequest>) =>
    void run(
      () =>
        client.updateUser(user.id, {
          expectedVersion: user.version,
          displayName: user.displayName,
          role: user.role,
          status: user.status,
          note: user.note,
          ...change,
        }),
      'admin.users.saved',
    );

  const { users, learnerData } = state.data;
  return (
    <section className="section" aria-labelledby="users-title">
      <h2 id="users-title">{t('admin.users.title')}</h2>
      <p className="notice" role="note">
        {t('admin.users.no_login')}
      </p>
      {message && <StatusMessage tone={message.tone} title={t(message.key)} />}

      <form className="card admin-form" onSubmit={create} aria-labelledby="user-new-title">
        <h3 id="user-new-title" className="card__title">
          {t('admin.users.add')}
        </h3>
        <div className="admin-form__grid">
          <div className="field">
            <label htmlFor="user-name">{t('admin.users.name')}</label>
            <input
              id="user-name"
              type="text"
              value={form.displayName}
              maxLength={60}
              aria-describedby="user-name-help"
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
            <span id="user-name-help" className="field__counter">
              {t('admin.users.name_help')}
            </span>
          </div>
          <div className="field">
            <label htmlFor="user-role">{t('admin.users.role')}</label>
            <select
              id="user-role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as AdminUser['role'] })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`admin.users.roles.${r}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="user-note">{t('admin.users.note')}</label>
            <input
              id="user-note"
              type="text"
              value={form.note}
              maxLength={300}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
        </div>
        <button
          type="submit"
          className="button button--primary"
          disabled={busy || form.displayName.trim().length < 2}
        >
          {t('admin.users.create')}
        </button>
      </form>

      <h3>{t('admin.users.directory')}</h3>
      {users.length === 0 ? (
        <p className="hint-text">{t('admin.users.empty')}</p>
      ) : (
        <div className="table-scroll card">
          <table className="report-table admin-table">
            <caption className="visually-hidden">{t('admin.users.directory')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('admin.users.name')}</th>
                <th scope="col">{t('admin.users.role')}</th>
                <th scope="col">{t('admin.users.status')}</th>
                <th scope="col">{t('admin.users.note')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow key={u.id} user={u} busy={busy} onSave={save} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>{t('admin.users.learner_data')}</h3>
      <p className="hint-text">{t('admin.users.learner_data_help')}</p>
      {learnerData.length === 0 ? (
        <p className="hint-text">{t('admin.users.no_sessions')}</p>
      ) : (
        <div className="table-scroll card">
          <table className="report-table admin-table">
            <caption className="visually-hidden">{t('admin.users.learner_data')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('admin.users.owner')}</th>
                <th scope="col">{t('admin.users.sessions')}</th>
                <th scope="col">{t('admin.users.submitted')}</th>
                <th scope="col">{t('admin.users.last')}</th>
              </tr>
            </thead>
            <tbody>
              {learnerData.map((l) => (
                <tr key={l.ownerId}>
                  <th scope="row" className="admin-table__mono">
                    {l.ownerId}
                  </th>
                  <td>{l.sessions}</td>
                  <td>{l.submitted}</td>
                  <td>{l.lastStartedOn || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
