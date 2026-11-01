import { useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/ui/Icon';

export const PRACTICE_SECTIONS = [
  'context',
  'materials',
  'predictions',
  'protocol',
  'results',
  'reflection',
  'summary',
] as const;
export type PracticeSection = (typeof PRACTICE_SECTIONS)[number];

/** Vertical notebook rail; controlled values live in the parent and survive changing pages. */
export function PracticeNotebook({
  children,
  initial = 'protocol',
}: {
  children: Record<PracticeSection, ReactNode>;
  initial?: PracticeSection;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [active, setActive] = useState<PracticeSection | null>(initial);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <aside
      className={`practice-notebook${active === null ? ' practice-notebook--closed' : ''}`}
      aria-label={t('ui.side.notebook')}
    >
      <nav className="practice-notebook__rail" aria-label={t('ui.side.label')}>
        <p>
          <Icon name="book" size={18} />
          {t('ui.side.notebook')}
        </p>
        <ol>
          {PRACTICE_SECTIONS.map((section, i) => (
            <li key={section}>
              <button
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                aria-expanded={active === section}
                aria-controls={`${id}-${section}`}
                onClick={() => setActive((a) => (a === section ? null : section))}
                onKeyDown={(e) => {
                  const index =
                    e.key === 'ArrowDown'
                      ? (i + 1) % PRACTICE_SECTIONS.length
                      : e.key === 'ArrowUp'
                        ? (i + PRACTICE_SECTIONS.length - 1) % PRACTICE_SECTIONS.length
                        : e.key === 'Home'
                          ? 0
                          : e.key === 'End'
                            ? PRACTICE_SECTIONS.length - 1
                            : null;
                  if (index !== null) {
                    e.preventDefault();
                    refs.current[index]?.focus();
                  }
                  if (e.key === 'Escape') setActive(null);
                }}
              >
                <span>{i + 1}</span>
                {t(`ui.side.${section}`)}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {PRACTICE_SECTIONS.map((section) => (
        <section
          key={section}
          id={`${id}-${section}`}
          hidden={active !== section}
          className="practice-notebook__reading"
          aria-label={t(`ui.side.${section}`)}
        >
          <header>
            <h2>{t(`ui.side.${section}`)}</h2>
            <button
              className="button"
              type="button"
              aria-label={t('ui.side.close_notebook')}
              onClick={() => {
                setActive(null);
                refs.current[PRACTICE_SECTIONS.indexOf(section)]?.focus();
              }}
            >
              ×
            </button>
          </header>
          <div className="practice-notebook__content">
            {active === section ? children[section] : null}
          </div>
        </section>
      ))}
    </aside>
  );
}
