import { useTranslation } from 'react-i18next';
import { formatSeconds } from '../lib/format';
import type { LogKind } from '../store/sessionStore';
import { useSession } from '../store/StoreProvider';

/** Text prefixes make each kind distinguishable without relying on colour. */
const KIND_LABEL: Record<LogKind, string> = {
  observation: 'ui.log.kind.observation',
  safety: 'ui.log.kind.safety',
  rejected: 'ui.log.kind.rejected',
  procedural: 'ui.log.kind.procedural',
  guidance: 'ui.log.kind.guidance',
};

export function ObservationLog() {
  const { t } = useTranslation();
  const session = useSession((s) => s.session);
  const log = useSession((s) => s.log);
  const locale = useSession((s) => s.locale);
  if (!session) return null;
  const showProcedural = session.guidance.showProceduralFeedback;
  const visible = log
    .filter((l) => l.visibility === 'always' || showProcedural)
    .slice()
    .reverse();
  const events = session.events.slice().reverse();

  return (
    <section className="panel observation-log" aria-labelledby="log-title">
      <h2 id="log-title">{t('ui.log.title')}</h2>
      <div className="two-column two-column--tight">
        <div>
          <h3>{t('ui.log.feedback')}</h3>
          {visible.length === 0 ? (
            <p className="hint-text">{t('ui.log.empty')}</p>
          ) : (
            <ol className="log-list" reversed>
              {visible.map((l) => (
                <li key={l.id} className={`log-entry log-entry--${l.kind}`}>
                  <span className="log-entry__kind">{t(KIND_LABEL[l.kind])}</span> {t(l.messageKey)}
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <h3>{t('ui.log.events')}</h3>
          {events.length === 0 ? (
            <p className="hint-text">{t('ui.log.empty')}</p>
          ) : (
            <ol className="log-list" reversed>
              {events.map((e) => (
                <li
                  key={e.seq}
                  className={e.accepted ? 'event-entry' : 'event-entry event-entry--rejected'}
                >
                  <span className="event-entry__seq">#{e.seq}</span>{' '}
                  {t(`exp04.action.${e.actionType}`)} —{' '}
                  {t(e.accepted ? 'ui.log.accepted' : 'ui.log.rejected')} ·{' '}
                  {t(`ui.log.actor.${e.actor}`)} ·{' '}
                  {t('ui.log.seconds', { seconds: formatSeconds(e.elapsedMs, locale) })}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
