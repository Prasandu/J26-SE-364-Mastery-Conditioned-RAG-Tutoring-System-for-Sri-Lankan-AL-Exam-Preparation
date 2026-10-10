import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';

/** Persistent safety area. Safety feedback is visible in every mode. */
export function SafetyAlert() {
  const { t } = useTranslation();
  const session = useSession((s) => s.session);
  const log = useSession((s) => s.log);
  const engine = useSession((s) => s.engine);
  const attempt = session?.attempt ?? 0;
  const safety = log.filter((l) => l.kind === 'safety' && l.attempt === attempt);
  const latest = safety.at(-1);
  const precaution = engine.definition.safetyRules.find((r) => r.id === 'avoid_touching_chemicals');

  return (
    <section className="safety-alert" aria-labelledby="safety-title">
      <h2 id="safety-title" className="visually-hidden">
        {t('ui.safety.title')}
      </h2>
      {precaution && (
        <p className="safety-alert__precaution">
          <span className="label">{t('ui.safety.precaution')}</span> {t(precaution.textKey)}
        </p>
      )}
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
