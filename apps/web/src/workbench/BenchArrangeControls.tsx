import { useTranslation } from 'react-i18next';
import type { BenchOffset, BenchOffsets } from './benchLayout';

export function BenchArrangeControls({
  selected,
  label,
  offsets,
  onMove,
  onReset,
}: {
  selected: string;
  label: string;
  offsets: BenchOffsets;
  onMove: (id: string, p: BenchOffset) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const current = offsets[selected] ?? { x: 0, z: 0 };
  return (
    <div className="practice-move" role="group" aria-label={t('ui.practice.arrange')}>
      <span>{label}</span>
      {(['left', 'right', 'back', 'front'] as const).map((direction, i) => (
        <button
          key={direction}
          type="button"
          className="button"
          disabled={!selected}
          aria-label={t(`ui.practice.move_${direction}`, { instrument: label })}
          onClick={() =>
            onMove(selected, {
              x: current.x + (i === 0 ? -0.2 : i === 1 ? 0.2 : 0),
              z: current.z + (i === 2 ? -0.15 : i === 3 ? 0.15 : 0),
            })
          }
        >
          {['←', '→', '↑', '↓'][i]}
        </button>
      ))}
      <button className="button" type="button" onClick={onReset}>
        {t('ui.practice.reset_layout')}
      </button>
      <p className="hint-text">{t('ui.practice.move_note')}</p>
    </div>
  );
}
