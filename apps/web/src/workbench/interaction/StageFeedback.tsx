import type { Feedback } from '@vlab/contracts';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../store/StoreProvider';

const KIND: Record<Feedback['severity'], string> = {
  info: 'guidance',
  observation: 'observation',
  warning: 'procedural',
  error: 'rejected',
  safety: 'safety',
};

/**
 * Feedback for the latest action, shown on the laboratory itself. The entries are exactly what the
 * engine returned after the projection's disclosure rules (manual mode never sees procedural
 * errors here). Screen readers already get the engine text from the workbench live region, so that
 * visual copy is hidden from them; gesture notices are announced here.
 */
export function StageFeedback({ notice }: { notice: { key: string; id: number } | null }) {
  const { t } = useTranslation();
  const feedback = useSession((s) => s.feedback);
  const seq = useSession((s) => s.session?.nextSequence ?? 0);
  return (
    <div className="stage-feedback">
      {feedback.length > 0 && (
        <div key={`seq-${seq}`} className="stage-toast-group" aria-hidden="true">
          {feedback.map((f, i) => (
            <p key={i} className={`stage-toast stage-toast--${KIND[f.severity]}`}>
              <strong>{t(`ui.log.kind.${KIND[f.severity]}`)}</strong> {t(f.messageKey)}
            </p>
          ))}
        </div>
      )}
      {notice && (
        <p key={`notice-${notice.id}`} className="stage-toast stage-toast--notice" role="status">
          {t(notice.key)}
        </p>
      )}
    </div>
  );
}
