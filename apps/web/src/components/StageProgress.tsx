import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';

/** Ordered experiment stages with the engine's current stage (horizontal or as a vertical list). */
export function StageProgress({ vertical = false }: { vertical?: boolean }) {
  const { t } = useTranslation();
  const engine = useSession((s) => s.engine);
  const current = useSession((s) => s.session?.stage);
  const stages = engine.definition.stages;
  const currentIndex = stages.findIndex((s) => s.id === current);
  return (
    <nav
      aria-label={t('ui.stage.label')}
      className={vertical ? 'stage-progress stage-progress--vertical' : 'stage-progress'}
    >
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
