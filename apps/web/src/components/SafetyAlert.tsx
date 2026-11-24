import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';

/**
 * Safety warnings for the current attempt. There is no longer a persistent precaution banner; this
 * renders nothing until the engine records a safety event, and then shows the warning (and its
 * history). `role="alert"` announces on insertion, so screen-reader users still hear a new warning.
 */
export function SafetyAlert() {
  const { t } = useTranslation();
  const session = useSession((s) => s.session);
  const log = useSession((s) => s.log);
  const attempt = session?.attempt ?? 0;
  const safety = log.filter((l) => l.kind === 'safety' && l.attempt === attempt);
  const latest = safety.at(-1);

  // Nothing to show until a safety event occurs: keeps the workbench clean (no empty banner).
  if (safety.length === 0) return null;

  return (
    <section className="safety-alert" aria-labelledby="safety-title">
      <h2 id="safety-title" className="visually-hidden">
        {t('ui.safety.title')}
      </h2>
      <div role="alert" aria-live="assertive" className="safety-alert__live">
        {latest && (
          <p className="safety-alert__warning">
            <span className="label">{t('ui.log.kind.safety')}</span> {t(latest.messageKey)}
          </p>
        )}
      </div>
      {safety.length > 1 && (
        <details>
          <summary>{t('ui.safety.history', { count: safety.length })}</summary>
          <ul>
            {safety.map((l) => (
              <li key={l.id}>{t(l.messageKey)}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
