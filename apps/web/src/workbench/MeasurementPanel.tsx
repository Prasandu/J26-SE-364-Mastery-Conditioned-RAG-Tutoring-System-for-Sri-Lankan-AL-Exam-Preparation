import type { MeasurementId } from '@vlab/contracts';
import { useTranslation } from 'react-i18next';
import { formatQuantity } from '../lib/format';
import { useSession } from '../store/StoreProvider';

/** Readings the learner can see directly on the apparatus. */
const OBSERVABLE: readonly MeasurementId[] = [
  'watch_glass_mass',
  'balance_slider_setting',
  'weighed_solute_mass',
];
/** Engine-derived values; shown only when the profile reveals procedural feedback (manual: report only). */
const DERIVED: readonly MeasurementId[] = [
  'transferred_solute_mass',
  'final_volume',
  'achieved_concentration',
];

export function MeasurementPanel() {
  const { t } = useTranslation();
  const session = useSession((s) => s.session);
  const locale = useSession((s) => s.locale);
  if (!session) return null;
  const showDerived = session.guidance.showProceduralFeedback;
  const events = session.events.filter((e) => e.attempt === session.attempt && e.accepted);
  const latest = new Map<MeasurementId, { value: string; seq: number }>();
  for (const e of events)
    for (const m of e.measurements)
      if (OBSERVABLE.includes(m.id) || (showDerived && DERIVED.includes(m.id)))
        latest.set(m.id, {
          value: formatQuantity(m.quantity, locale, m.id === 'achieved_concentration' ? 4 : 2),
          seq: e.seq,
        });
  // A provisional (teacher-review-pending) parameter changed a numeric result in this attempt.
  const provisional = events.some((e) =>
    e.errors.some((x) => x.parameterIds.length > 0 && x.consequence.startsWith('numeric')),
  );
  const rows = [...OBSERVABLE, ...DERIVED].filter((id) => latest.has(id));

  return (
    <section className="panel measurement-panel" aria-labelledby="measurements-title">
      <h2 id="measurements-title">{t('ui.measurements.title')}</h2>
      {rows.length === 0 ? (
        <p className="hint-text">{t('ui.measurements.none')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">{t('ui.measurements.quantity')}</th>
              <th scope="col">{t('ui.measurements.value')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((id) => (
              <tr key={id}>
                <th scope="row">{t(`exp04.measurement.${id}`)}</th>
                <td>
                  {latest.get(id)?.value}
                  {DERIVED.includes(id) && provisional && (
                    <span className="provisional-note"> {t('ui.measurements.provisional')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!showDerived && <p className="hint-text">{t('ui.measurements.manual_note')}</p>}
    </section>
  );
}
