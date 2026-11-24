import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';

/** Connectivity/server errors. Retry resends the identical request (same clientActionId). */
export function ConnectionBanner() {
  const { t } = useTranslation();
  const connection = useSession((s) => s.connection);
  const retry = useSession((s) => s.retryLastAction);
  const busy = useSession((s) => s.ui.busy);
  if (!connection) return null;
  const known = [
    'network_unavailable',
    'verifier_unavailable',
    'verifier_timeout',
    'stale_sequence',
  ];
  const key = known.includes(connection.code)
    ? `ui.connection.${connection.code}`
    : 'ui.connection.generic';
  return (
    <div
      className={
        connection.retryable ? 'connection-banner' : 'connection-banner connection-banner--error'
      }
      role="alert"
    >
      <p>
        <span className="label">{t('ui.connection.title')}</span> {t(key)}
      </p>
      {connection.retry && (
        <button type="button" className="button" disabled={busy} onClick={() => void retry()}>
          {t('ui.connection.retry')}
        </button>
      )}
    </div>
  );
}
