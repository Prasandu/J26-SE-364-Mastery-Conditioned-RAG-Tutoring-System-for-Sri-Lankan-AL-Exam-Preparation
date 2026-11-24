import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';

/** Confirmation for beginner-predicted errors, unsafe actions and mode changes. */
export function ConfirmDialog() {
  const { t } = useTranslation();
  const pending = useSession((s) => s.ui.pending);
  const confirm = useSession((s) => s.confirmPending);
  const cancel = useSession((s) => s.cancelPending);
  if (!pending) return null;

  const titleKey =
    pending.kind === 'safety'
      ? 'ui.confirm.safety_title'
      : pending.kind === 'mode_change'
        ? 'ui.confirm.mode_change_title'
        : 'ui.confirm.predicted_title';
  const bodyKey =
    pending.kind === 'safety'
      ? 'ui.confirm.safety_body'
      : pending.kind === 'mode_change'
        ? 'ui.confirm.mode_change_body'
        : 'ui.confirm.predicted_body';

  return (
    <div className="dialog-backdrop">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className={pending.kind === 'safety' ? 'dialog dialog--safety' : 'dialog'}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel();
        }}
      >
        <h2 id="confirm-title">{t(titleKey)}</h2>
        <div id="confirm-body">
          <p>{t(bodyKey)}</p>
          {pending.kind !== 'mode_change' && (
            <ul>
              {pending.errorCodes.map((code) => (
                <li key={code}>{t(`exp04.error.${code.toLowerCase()}.message`)}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="dialog__actions">
          <button type="button" className="button" onClick={cancel} autoFocus>
            {t('ui.confirm.cancel')}
          </button>
          <button
            type="button"
            className={
              pending.kind === 'safety' ? 'button button--warning' : 'button button--primary'
            }
            onClick={() => void confirm()}
          >
            {t(pending.kind === 'safety' ? 'ui.confirm.safety_continue' : 'ui.confirm.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
