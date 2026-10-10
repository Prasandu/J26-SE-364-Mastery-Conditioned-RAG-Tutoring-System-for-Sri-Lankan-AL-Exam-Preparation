import { NOTEBOOK_LIMITS, UnitSchema, type NotebookDocument, type Unit } from '@vlab/contracts';
import { useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { SessionNav } from '../components/SessionNav';
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
const TEXT_FIELDS: { field: TextField; max: number; rows: number }[] = [
  { field: 'aim', max: NOTEBOOK_LIMITS.mediumText, rows: 2 },
  { field: 'procedure', max: NOTEBOOK_LIMITS.longText, rows: 5 },
  { field: 'observations', max: NOTEBOOK_LIMITS.longText, rows: 4 },
];
const LATER_FIELDS: { field: TextField; max: number; rows: number }[] = [
  { field: 'calculations', max: NOTEBOOK_LIMITS.longText, rows: 4 },
  { field: 'graphNotes', max: NOTEBOOK_LIMITS.mediumText, rows: 2 },
  { field: 'result', max: NOTEBOOK_LIMITS.mediumText, rows: 2 },
  { field: 'discussion', max: NOTEBOOK_LIMITS.longText, rows: 4 },
  { field: 'identifiedErrors', max: NOTEBOOK_LIMITS.longText, rows: 3 },
  { field: 'conclusion', max: NOTEBOOK_LIMITS.mediumText, rows: 2 },
];

// Stable empty values: selectors must not return a fresh [] on every call.
const NO_ITEMS: readonly string[] = [];
const NO_ROWS: NotebookDocument['measurements'] = [];

function TextArea({ field, max, rows }: { field: TextField; max: number; rows: number }) {
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
        onChange={(e) => edit((d) => ({ ...d, [field]: e.target.value }))}
      />
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
        rows={4}
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
  return (
    <fieldset>
      <legend>{t('ui.notebook.field.measurements')}</legend>
      <table className="notebook-table">
        <thead>
          <tr>
            <th scope="col">{t('ui.notebook.measurement.label')}</th>
            <th scope="col">{t('ui.notebook.measurement.trial')}</th>
            <th scope="col">{t('ui.notebook.measurement.value')}</th>
            <th scope="col">{t('ui.notebook.measurement.unit')}</th>
            <th scope="col">{t('ui.notebook.measurement.note')}</th>
            <th scope="col">
              <span className="visually-hidden">{t('ui.notebook.measurement.remove')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <input
                  aria-label={`${t('ui.notebook.measurement.label')} ${i + 1}`}
                  type="text"
                  maxLength={120}
                  value={r.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                />
              </td>
              <td>
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
              <td>
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
              <td>
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
              <td>
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
                    edit((d) => ({ ...d, measurements: d.measurements.filter((_, j) => j !== i) }))
                  }
                >
                  {t('ui.notebook.measurement.remove')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

/**
 * Digital laboratory notebook. Student text is stored exactly as typed, in whatever language it was
 * written; switching the interface language never translates or clears it.
 */
export function NotebookView() {
  const { t } = useTranslation();
  const session = useSession((s) => s.session);
  const notebook = useSession((s) => s.notebook);
  const edit = useSession((s) => s.editNotebook);
  const save = useSession((s) => s.saveNotebook);
  const engine = useSession((s) => s.engine);

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

  return (
    <section className="view view--notebook" aria-labelledby="notebook-title">
      <header className="workbench__bar">
        <h1 id="notebook-title">{t('ui.notebook.title')}</h1>
        <SessionNav current="notebook" />
      </header>
      <ConnectionBanner />
      <p className="hint-text">{t('ui.notebook.intro')}</p>
      <form
        className="card notebook"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="field field--inline">
          <label htmlFor="nb-date">{t('ui.notebook.field.experimentDate')}</label>
          <input
            id="nb-date"
            type="date"
            value={notebook.draft?.experimentDate ?? ''}
            onChange={(e) =>
              edit((d) => ({ ...d, experimentDate: e.target.value === '' ? null : e.target.value }))
            }
          />
        </div>
        {TEXT_FIELDS.map((f) => (
          <TextArea key={f.field} {...f} />
        ))}
        <div className="two-column">
          <ListField field="apparatus" />
          <ListField field="chemicals" />
        </div>
        <MeasurementTable />
        {LATER_FIELDS.map((f) => (
          <TextArea key={f.field} {...f} />
        ))}
        <div className="notebook__save">
          <button
            type="submit"
            className="button button--primary"
            disabled={status === 'saving' || notebook.draft === null}
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
    </section>
  );
}
