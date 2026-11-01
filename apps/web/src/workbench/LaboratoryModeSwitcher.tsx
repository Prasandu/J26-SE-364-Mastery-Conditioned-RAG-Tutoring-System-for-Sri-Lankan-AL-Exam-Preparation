import { useTranslation } from 'react-i18next';
import type { LabView } from '../store/sessionStore';

/** Renderer choice. A presentation preference only: it never dispatches an engine action. */
export function LaboratoryModeSwitcher({
  value,
  onChange,
}: {
  value: LabView;
  onChange: (view: LabView) => void;
}) {
  const { t } = useTranslation();
  const option = (view: LabView, key: string) => (
    <button
      type="button"
      className={
        value === view ? 'lab-switch__option lab-switch__option--active' : 'lab-switch__option'
      }
      aria-pressed={value === view}
      onClick={() => onChange(view)}
    >
      {t(key)}
    </button>
  );
  return (
    <div className="lab-switch" role="group" aria-label={t('ui.lab.renderer')}>
      {option('2d', 'ui.lab.renderer_2d')}
      {option('3d', 'ui.lab.renderer_3d')}
    </div>
  );
}
