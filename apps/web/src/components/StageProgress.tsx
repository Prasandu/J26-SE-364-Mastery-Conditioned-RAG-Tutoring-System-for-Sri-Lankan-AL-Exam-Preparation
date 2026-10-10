import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';

export function StageProgress() {
  const { t } = useTranslation();
  const engine = useSession((s) => s.engine);
  const current = useSession((s) => s.session?.stage);
  const stages = engine.definition.stages;
  const currentIndex = stages.findIndex((s) => s.id === current);
  return (
    <nav aria-label={t('ui.stage.label')} className="stage-progress">
      <ol>
        {stages.map((s, i) => {
          const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo';
          return (
            <li
              key={s.id}
              className={`stage stage--${state}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span aria-hidden="true">{state === 'done' ? '✓ ' : ''}</span>
              {t(s.titleKey)}
              <span className="visually-hidden"> ({t(`ui.stage.${state}`)})</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
