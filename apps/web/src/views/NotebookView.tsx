import { NOTEBOOK_LIMITS, UnitSchema, type NotebookDocument, type Unit } from '@vlab/contracts';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { Icon } from '../components/ui/Icon';
import { UNIT_LABEL } from '../lib/format';
import { useSession } from '../store/StoreProvider';

type TextField =
  | 'aim'
  | 'procedure'
  | 'observations'
  | 'calculations'
  | 'graphNotes'
  | 'result'
  | 'discussion'
  | 'identifiedErrors'
  | 'conclusion';

interface TextSpec {
  field: TextField;
  max: number;
  rows: number;
}

const TEXT: Record<TextField, TextSpec> = {
  // The aim is prefilled with every source-backed objective (three lines for this practical), so
  // it needs room to show them all rather than clipping after the second.
  aim: { field: 'aim', max: NOTEBOOK_LIMITS.mediumText, rows: 6 },
  procedure: { field: 'procedure', max: NOTEBOOK_LIMITS.longText, rows: 12 },
  observations: { field: 'observations', max: NOTEBOOK_LIMITS.longText, rows: 10 },
  calculations: { field: 'calculations', max: NOTEBOOK_LIMITS.longText, rows: 10 },
  graphNotes: { field: 'graphNotes', max: NOTEBOOK_LIMITS.mediumText, rows: 3 },
  result: { field: 'result', max: NOTEBOOK_LIMITS.mediumText, rows: 4 },
  discussion: { field: 'discussion', max: NOTEBOOK_LIMITS.longText, rows: 8 },
  identifiedErrors: { field: 'identifiedErrors', max: NOTEBOOK_LIMITS.longText, rows: 6 },
  conclusion: { field: 'conclusion', max: NOTEBOOK_LIMITS.mediumText, rows: 6 },
};

type SectionId =
  | 'aim'
  | 'apparatus'
  | 'procedure'
  | 'observations'
  | 'measurements'
  | 'calculations'
  | 'result'
  | 'conclusion';

/**
 * The notebook's eight writing sections. `labelKey` reuses the existing field labels, so the
 * section names are already translated and reviewed — no new Sinhala strings are introduced here.
 * `has` answers "does this section contain the student's own work yet?" from the real draft only.
 */
const SECTIONS: {
  id: SectionId;
  labelKey: string;
  has: (d: NotebookDocument) => boolean;
}[] = [
  { id: 'aim', labelKey: 'ui.notebook.field.aim', has: (d) => d.aim.trim() !== '' },
  {
    id: 'apparatus',
    labelKey: 'ui.notebook.field.apparatus',
    has: (d) => d.apparatus.length > 0 || d.chemicals.length > 0,
  },
  {
    id: 'procedure',
    labelKey: 'ui.notebook.field.procedure',
    has: (d) => d.procedure.trim() !== '',
  },
  {
    id: 'observations',
    labelKey: 'ui.notebook.field.observations',
    has: (d) => d.observations.trim() !== '',
  },
  {
    id: 'measurements',
    labelKey: 'ui.notebook.field.measurements',
    has: (d) => d.measurements.length > 0,
  },
  {
    id: 'calculations',
    labelKey: 'ui.notebook.field.calculations',
    has: (d) => d.calculations.trim() !== '' || d.graphNotes.trim() !== '',
  },
  {
    id: 'result',
    labelKey: 'ui.notebook.field.result',
    has: (d) =>
      d.result.trim() !== '' || d.discussion.trim() !== '' || d.identifiedErrors.trim() !== '',
  },
  {
    id: 'conclusion',
    labelKey: 'ui.notebook.field.conclusion',
    has: (d) => d.conclusion.trim() !== '',
  },
];

// Stable empty values: selectors must not return a fresh [] on every call.
const NO_ITEMS: readonly string[] = [];
const NO_ROWS: NotebookDocument['measurements'] = [];

function TextArea({ field, max, rows }: TextSpec) {
  const { t } = useTranslation();
  const value = useSession((s) => s.notebook.draft?.[field] ?? '');
  const edit = useSession((s) => s.editNotebook);
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{t(`ui.notebook.field.${field}`)}</label>
      <textarea
        id={id}
        rows={rows}
        maxLength={max}
        value={value}
        aria-describedby={`${id}-count`}
        onChange={(e) => edit((d) => ({ ...d, [field]: e.target.value }))}
      />
      <span id={`${id}-count`} className="field__counter">
        {t('ui.prelab.characters', { count: value.length, max })}
      </span>
    </div>
  );
}

function ListField({ field }: { field: 'apparatus' | 'chemicals' }) {
  const { t } = useTranslation();
  const items = useSession((s) => s.notebook.draft?.[field] ?? NO_ITEMS);
  const edit = useSession((s) => s.editNotebook);
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{t(`ui.notebook.field.${field}`)}</label>
      <textarea
        id={id}
        rows={8}
        aria-describedby={`${id}-help`}
        value={items.join('\n')}
        onChange={(e) =>
          edit((d) => ({
            ...d,
            [field]: e.target.value
              .split('\n')
              .slice(0, NOTEBOOK_LIMITS.listItems)
              .map((line) => line.slice(0, NOTEBOOK_LIMITS.shortText)),
          }))
        }
      />
      <span id={`${id}-help`} className="hint-text">
        {t('ui.notebook.one_per_line')}
      </span>
    </div>
  );
}

function MeasurementTable() {
  const { t } = useTranslation();
  const rows = useSession((s) => s.notebook.draft?.measurements ?? NO_ROWS);
  const edit = useSession((s) => s.editNotebook);
  const update = (i: number, patch: Partial<NotebookDocument['measurements'][number]>) =>
    edit((d) => ({
      ...d,
      measurements: d.measurements.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    }));
  const columns = ['label', 'trial', 'value', 'unit', 'note'] as const;
  return (
    <fieldset className="notebook-measurements">
      {/* The section heading above already shows this name; keep it for the fieldset's
          accessible name without repeating it on screen. */}
      <legend className="visually-hidden">{t('ui.notebook.field.measurements')}</legend>
      {rows.length === 0 && <p className="hint-text">{t('ui.measurements.none')}</p>}
      {rows.length > 0 && (
        <table className="notebook-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col">
                  {t(`ui.notebook.measurement.${c}`)}
                </th>
              ))}
              <th scope="col">
                <span className="visually-hidden">{t('ui.notebook.measurement.remove')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {/* `data-label` drives the stacked card layout used on narrow screens, so the
                    table never needs to scroll sideways on a phone. */}
                <td data-label={t('ui.notebook.measurement.label')}>
                  <input
                    aria-label={`${t('ui.notebook.measurement.label')} ${i + 1}`}
                    type="text"
                    maxLength={120}
                    value={r.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                  />
                </td>
                <td data-label={t('ui.notebook.measurement.trial')}>
                  <input
                    aria-label={`${t('ui.notebook.measurement.trial')} ${i + 1}`}
                    type="number"
                    min={1}
                    max={10}
                    step={1}
                    value={r.trial ?? ''}
                    onChange={(e) =>
                      update(i, { trial: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  />
                </td>
                <td data-label={t('ui.notebook.measurement.value')}>
                  <input
                    aria-label={`${t('ui.notebook.measurement.value')} ${i + 1}`}
                    type="number"
                    step="any"
                    value={r.value ?? ''}
                    onChange={(e) =>
                      update(i, { value: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  />
                </td>
                <td data-label={t('ui.notebook.measurement.unit')}>
                  <select
                    aria-label={`${t('ui.notebook.measurement.unit')} ${i + 1}`}
                    value={r.unit ?? ''}
                    onChange={(e) =>
                      update(i, { unit: e.target.value === '' ? null : (e.target.value as Unit) })
                    }
                  >
                    <option value="">—</option>
                    {UnitSchema.options.map((u) => (
                      <option key={u} value={u}>
                        {UNIT_LABEL[u]}
                      </option>
                    ))}
                  </select>
                </td>
                <td data-label={t('ui.notebook.measurement.note')}>
                  <input
                    aria-label={`${t('ui.notebook.measurement.note')} ${i + 1}`}
                    type="text"
                    maxLength={300}
                    value={r.note}
                    onChange={(e) => update(i, { note: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="button"
                    onClick={() =>
                      edit((d) => ({
                        ...d,
                        measurements: d.measurements.filter((_, j) => j !== i),
                      }))
                    }
                  >
                    {t('ui.notebook.measurement.remove')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button
        type="button"
        className="button"
        disabled={rows.length >= NOTEBOOK_LIMITS.measurementRows}
        onClick={() =>
          edit((d) => ({
            ...d,
            measurements: [
              ...d.measurements,
              { label: '', trial: null, value: null, unit: null, note: '' },
            ],
          }))
        }
      >
        {t('ui.notebook.measurement.add')}
      </button>
    </fieldset>
  );
}

function SectionFields({ id }: { id: SectionId }) {
  const { t } = useTranslation();
  const date = useSession((s) => s.notebook.draft?.experimentDate ?? '');
  const edit = useSession((s) => s.editNotebook);
  switch (id) {
    case 'aim':
      return (
        <>
          <div className="field field--inline">
            <label htmlFor="nb-date">{t('ui.notebook.field.experimentDate')}</label>
            <input
              id="nb-date"
              type="date"
              value={date}
              onChange={(e) =>
                edit((d) => ({
                  ...d,
                  experimentDate: e.target.value === '' ? null : e.target.value,
                }))
              }
            />
          </div>
          <TextArea {...TEXT.aim} />
        </>
      );
    case 'apparatus':
      return (
        <div className="two-column">
          <ListField field="apparatus" />
          <ListField field="chemicals" />
        </div>
      );
    case 'procedure':
      return <TextArea {...TEXT.procedure} />;
    case 'observations':
      return <TextArea {...TEXT.observations} />;
    case 'measurements':
      return <MeasurementTable />;
    case 'calculations':
      return (
        <>
          <TextArea {...TEXT.calculations} />
          <TextArea {...TEXT.graphNotes} />
        </>
      );
    case 'result':
      return (
        <>
          <TextArea {...TEXT.result} />
          <TextArea {...TEXT.discussion} />
          <TextArea {...TEXT.identifiedErrors} />
        </>
      );
    case 'conclusion':
      return <TextArea {...TEXT.conclusion} />;
  }
}

/**
 * Digital laboratory notebook: eight writing sections, one shown at a time, instead of a single
 * very long form. Student text is stored exactly as typed, in whatever language it was written;
 * switching the interface language never translates or clears it.
 *
 * Every field still reads and writes the one `notebook.draft` in the store, so moving between
 * sections (or leaving the page entirely) keeps the draft intact — there is no second copy of the
 * notebook state, and nothing here touches the simulation engine or its stage.
 */
export function NotebookView() {
  const { t } = useTranslation();
  const session = useSession((s) => s.session);
  const notebook = useSession((s) => s.notebook);
  const edit = useSession((s) => s.editNotebook);
  const save = useSession((s) => s.saveNotebook);
  const engine = useSession((s) => s.engine);
  const [active, setActive] = useState<SectionId>('aim');
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Prefill only source-backed experiment metadata, once, in the current interface language.
  useEffect(() => {
    if (!session || notebook.draft !== null || notebook.savedVersion > 0) return;
    const def = engine.definition;
    edit((d) => ({
      ...d,
      experimentDate: session.startedOn,
      aim: def.learningObjectives
        .filter((o) => o.id.startsWith('aim_'))
        .map((o) => t(o.textKey))
        .join('\n'),
      apparatus: def.apparatus.filter((a) => a.role !== 'distractor').map((a) => t(a.nameKey)),
      chemicals: def.chemicals
        .filter((c) => c.role !== 'incorrect_solvent')
        .map((c) => t(c.nameKey)),
    }));
  }, [session, notebook.draft, notebook.savedVersion, engine, edit, t]);

  if (!session) return <p>{t('ui.workbench.no_session')}</p>;
  const status = notebook.status;
  const draft = notebook.draft;
  const index = SECTIONS.findIndex((s) => s.id === active);
  const current = SECTIONS[index]!;

  const goTo = (next: SectionId) => {
    setActive(next);
    tabs.current[next]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? 1
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? -1
          : e.key === 'Home'
            ? -index
            : e.key === 'End'
              ? SECTIONS.length - 1 - index
              : 0;
    if (step === 0) return;
    e.preventDefault();
    goTo(SECTIONS[(index + step + SECTIONS.length) % SECTIONS.length]!.id);
  };

  return (
    <section className="view view--notebook" aria-labelledby="notebook-title">
      <header className="notebook__head">
        <h1 id="notebook-title">{t('ui.notebook.title')}</h1>
        <p className="hint-text">{t('ui.notebook.intro')}</p>
      </header>
      <ConnectionBanner />

      <div className="notebook-layout">
        <div
          className="notebook-sections"
          role="tablist"
          aria-orientation="vertical"
          aria-label={t('ui.notebook.title')}
          onKeyDown={onKeyDown}
        >
          <ol>
            {SECTIONS.map((s, i) => {
              const written = draft ? s.has(draft) : false;
              return (
                <li key={s.id}>
                  <button
                    ref={(el) => {
                      tabs.current[s.id] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`nb-tab-${s.id}`}
                    aria-selected={active === s.id}
                    aria-controls={`nb-panel-${s.id}`}
                    tabIndex={active === s.id ? 0 : -1}
                    className={
                      active === s.id
                        ? 'notebook-sections__item is-active'
                        : 'notebook-sections__item'
                    }
                    onClick={() => goTo(s.id)}
                  >
                    <span className="notebook-sections__marker" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="notebook-sections__label">{t(s.labelKey)}</span>
                    {/* Reflects the draft only — an untouched section is never shown as done. */}
                    {written && (
                      <span
                        className="notebook-sections__done"
                        title={t('ui.notebook.status.saved')}
                      >
                        <Icon name="check" size={14} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <form
          className="card notebook-sheet"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div
            role="tabpanel"
            id={`nb-panel-${current.id}`}
            aria-labelledby={`nb-tab-${current.id}`}
            className="notebook-sheet__body"
          >
            {/* The numbered list on the left already carries the position, and "Stage" is the
                engine's word for an experiment stage — not a notebook section. */}
            <h2 className="notebook-sheet__title">{t(current.labelKey)}</h2>
            <SectionFields id={current.id} />
          </div>

          <nav className="notebook-pager" aria-label={t('ui.side.pager_label')}>
            <button
              type="button"
              className="notebook-pager__button notebook-pager__button--back"
              disabled={index === 0}
              onClick={() => goTo(SECTIONS[index - 1]!.id)}
            >
              <Icon name="arrow" size={14} />
              {t('ui.side.previous_section')}
            </button>
            <button
              type="button"
              className="notebook-pager__button"
              disabled={index === SECTIONS.length - 1}
              onClick={() => goTo(SECTIONS[index + 1]!.id)}
            >
              {t('ui.side.next_section')}
              <Icon name="arrow" size={14} />
            </button>
          </nav>

          <div className="notebook__save">
            <button
              type="submit"
              className="button button--primary"
              disabled={status === 'saving' || draft === null}
            >
              {t('ui.notebook.save')}
            </button>
            <p className={`save-status save-status--${status}`} aria-live="polite" role="status">
              {t(`ui.notebook.status.${status}`)}
            </p>
            {status === 'conflict' && (
              <button
                type="button"
                className="button button--warning"
                onClick={() => void save({ overwrite: true })}
              >
                {t('ui.notebook.overwrite')}
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
