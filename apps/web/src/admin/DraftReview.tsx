import {
  ADMIN_FIELDS,
  ADMIN_LIST_FIELDS,
  type AdminDraftContent,
  type AdminDraftDetail,
  type AdminField,
  type AdminReviewAction,
} from '@vlab/contracts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/ui/Icon';
import { StatusMessage } from '../components/ui/StatusMessage';
import { EngineError } from '../engine/adapter';
import type { AdminClient } from './adminClient';
import { StatusBadge } from './DraftList';

type ListField = (typeof ADMIN_LIST_FIELDS)[number];
const isList = (f: AdminField): f is ListField =>
  (ADMIN_LIST_FIELDS as readonly string[]).includes(f);

interface Form {
  values: Record<AdminField, string>;
  pages: Record<ListField, string>;
}

const toForm = (detail: AdminDraftDetail): Form => {
  const c = detail.draft.content;
  const values = {} as Record<AdminField, string>;
  const pages = {} as Record<ListField, string>;
  for (const f of ADMIN_FIELDS) {
    const v = c[f];
    values[f] = Array.isArray(v) ? v.join('\n') : v === null ? '' : String(v);
  }
  for (const f of ADMIN_LIST_FIELDS) pages[f] = (detail.draft.sourcePages[f] ?? []).join(', ');
  return { values, pages };
};

/** Form -> request content. Returns null with the first invalid field when parsing fails. */
const fromForm = (
  form: Form,
): { content: AdminDraftContent; sourcePages: Record<string, number[]> } | { invalid: string } => {
  const number = form.values.experimentNumber.trim();
  if (number && !/^\d{1,2}$/.test(number)) return { invalid: 'experimentNumber' };
  const lines = (f: ListField) =>
    form.values[f]
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  const sourcePages: Record<string, number[]> = {};
  for (const f of ADMIN_LIST_FIELDS) {
    const raw = form.pages[f].trim();
    if (!raw) continue;
    const parts = raw.split(/[,\s]+/).filter(Boolean);
    if (!parts.every((p) => /^\d{1,3}$/.test(p))) return { invalid: f };
    sourcePages[f] = parts.map(Number);
  }
  const text = (v: string) => (v.trim() ? v.trim() : null);
  return {
    content: {
      experimentNumber: number ? Number(number) : null,
      title: text(form.values.title),
      syllabusUnit: text(form.values.syllabusUnit),
      aims: lines('aims'),
      apparatus: lines('apparatus'),
      chemicals: lines('chemicals'),
      procedure: lines('procedure'),
      precautions: lines('precautions'),
      calculations: lines('calculations'),
      observations: lines('observations'),
      preLabQuestions: lines('preLabQuestions'),
      postLabQuestions: lines('postLabQuestions'),
    },
    sourcePages,
  };
};

const ISSUES = new Set([
  'missing_field',
  'heuristic_split',
  'calculations_from_introduction',
  'heading_reconstructed',
  'title_uncertain',
  'duplicate_in_document',
  'no_sections',
]);

const ERRORS = new Set([
  'draft_version_conflict',
  'review_transition_invalid',
  'invalid_request',
  'network_unavailable',
]);

/** Draft review: validation preview, field editing with source pages, and review actions. */
export function DraftReview({
  client,
  draftId,
  onChanged,
}: {
  client: AdminClient;
  draftId: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<AdminDraftDetail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; key: string } | null>(null);

  useEffect(() => {
    let active = true;
    client.draft(draftId).then(
      (d) => {
        if (!active) return;
        setDetail(d);
        setForm(toForm(d));
        setDirty(false);
      },
      () => active && setMessage({ tone: 'error', key: 'admin.error.generic' }),
    );
    return () => {
      active = false;
    };
  }, [client, draftId]);

  const run = async (op: () => Promise<AdminDraftDetail>, successKey: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const d = await op();
      setDetail(d);
      setForm(toForm(d));
      setDirty(false);
      setMessage({ tone: 'success', key: successKey });
      onChanged();
    } catch (error) {
      const code = error instanceof EngineError ? error.code : '';
      setMessage({
        tone: 'error',
        key: ERRORS.has(code) ? `admin.error.${code}` : 'admin.error.generic',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!detail || !form) {
    return message ? (
      <StatusMessage tone="error" title={t(message.key)} />
    ) : (
      <StatusMessage tone="loading" title={t('admin.loading')} />
    );
  }
  const { draft, validation } = detail;
  const archived = draft.status === 'archived';
  const save = () => {
    const parsed = fromForm(form);
    if ('invalid' in parsed) {
      setMessage({ tone: 'error', key: 'admin.error.invalid_field' });
      return;
    }
    void run(
      () => client.update(draft.id, { expectedVersion: draft.version, ...parsed }),
      'admin.review.saved',
    );
  };
  const act = (
    action: AdminReviewAction,
    field: AdminField | null = null,
    reviewed: boolean | null = null,
  ) =>
    run(
      () => client.review(draft.id, { expectedVersion: draft.version, action, field, reviewed }),
      'admin.review.updated',
    );
  const issuesFor = (f: string) => draft.extractionIssues.filter((i) => i.field === f);

  return (
    <section aria-labelledby="review-title" className="section admin-review">
      <header className="admin-review__head">
        <div>
          <p className="page-header__eyebrow">
            {draft.provenance.documentName} ·{' '}
            {t('admin.review.pages', {
              first: draft.provenance.pageRange[0],
              last: draft.provenance.pageRange[1],
            })}
          </p>
          <h2 id="review-title">
            {draft.content.experimentNumber !== null &&
              `${t('ui.card.experiment_number', { number: draft.content.experimentNumber })}: `}
            {draft.content.title ?? t('admin.missing_value')}
          </h2>
          <p className="admin-review__meta">
            <StatusBadge status={draft.status} />{' '}
            <span className="hint-text">
              {t('admin.review.version', { version: draft.version })}
            </span>
          </p>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void run(() => client.validate(draft.id), 'admin.review.validated')}
          >
            {t('admin.review.revalidate')}
          </button>
        </div>
      </header>

      {message && <StatusMessage tone={message.tone} title={t(message.key)} />}

      <div className="content-layout">
        <div className="content-layout__main">
          <section className="card" aria-labelledby="fields-title">
            <h3 id="fields-title" className="card__title">
              <Icon name="clipboard" /> {t('admin.review.fields')}
            </h3>
            <p className="hint-text">{t('admin.review.fields_help')}</p>
            {dirty && <p className="notice">{t('admin.review.unsaved')}</p>}
            {ADMIN_FIELDS.map((f) => {
              const id = `field-${f}`;
              const issues = issuesFor(f);
              const missing = validation.missingFields.includes(f);
              return (
                <div key={f} className={missing ? 'admin-field is-missing' : 'admin-field'}>
                  <div className="admin-field__head">
                    <label htmlFor={id}>{t(`admin.field.${f}`)}</label>
                    {draft.fieldEdited[f] && (
                      <span className="tag tag--warning">{t('admin.review.edited')}</span>
                    )}
                    {missing && (
                      <span className="tag tag--warning">{t('admin.review.missing')}</span>
                    )}
                    <span className="admin-field__review">
                      <input
                        type="checkbox"
                        id={`${id}-reviewed`}
                        checked={draft.fieldReview[f] ?? false}
                        disabled={busy || dirty || archived}
                        onChange={(e) => void act('mark_field', f, e.target.checked)}
                      />
                      <label htmlFor={`${id}-reviewed`}>{t('admin.review.reviewed')}</label>
                    </span>
                  </div>
                  {isList(f) ? (
                    <>
                      <textarea
                        id={id}
                        rows={Math.min(8, Math.max(2, form.values[f].split('\n').length + 1))}
                        value={form.values[f]}
                        disabled={archived}
                        aria-describedby={`${id}-help`}
                        onChange={(e) => {
                          setForm({ ...form, values: { ...form.values, [f]: e.target.value } });
                          setDirty(true);
                        }}
                      />
                      <span id={`${id}-help`} className="field__counter">
                        {t('admin.review.one_per_line')}
                      </span>
                      <label className="admin-field__pages" htmlFor={`${id}-pages`}>
                        {t('admin.review.source_pages')}
                        <input
                          id={`${id}-pages`}
                          type="text"
                          inputMode="numeric"
                          value={form.pages[f]}
                          disabled={archived}
                          onChange={(e) => {
                            setForm({ ...form, pages: { ...form.pages, [f]: e.target.value } });
                            setDirty(true);
                          }}
                        />
                      </label>
                    </>
                  ) : (
                    <input
                      id={id}
                      type="text"
                      inputMode={f === 'experimentNumber' ? 'numeric' : undefined}
                      value={form.values[f]}
                      disabled={archived}
                      onChange={(e) => {
                        setForm({ ...form, values: { ...form.values, [f]: e.target.value } });
                        setDirty(true);
                      }}
                    />
                  )}
                  {issues.map((i, n) => (
                    <p key={`${i.code}-${n}`} className="admin-field__issue">
                      <Icon name="alert" size={14} />{' '}
                      {t(ISSUES.has(i.code) ? `admin.issue.${i.code}` : 'admin.issue.other')}
                    </p>
                  ))}
                </div>
              );
            })}
            <div className="button-row">
              <button
                type="button"
                className="button button--primary"
                disabled={!dirty || busy || archived}
                onClick={save}
              >
                {t('admin.review.save')}
              </button>
              <button
                type="button"
                className="button"
                disabled={!dirty || busy}
                onClick={() => {
                  setForm(toForm(detail));
                  setDirty(false);
                }}
              >
                {t('admin.review.discard')}
              </button>
            </div>
          </section>
        </div>

        <aside className="content-layout__side" aria-label={t('admin.validation.title')}>
          <section className="card readiness" aria-labelledby="validation-title">
            <h3 id="validation-title" className="card__title">
              <Icon name="check" /> {t('admin.validation.title')}
            </h3>
            <ul className="readiness__list">
              <li
                className={
                  validation.contentComplete ? 'readiness__item is-done' : 'readiness__item'
                }
              >
                <span>{t('admin.validation.content')}</span>
                <span className="readiness__value">
                  {t(
                    validation.contentComplete
                      ? 'admin.validation.ok'
                      : 'admin.validation.incomplete',
                  )}
                </span>
                {!validation.contentComplete && (
                  <span className="readiness__note">
                    {t('admin.validation.missing_list', {
                      fields: validation.missingFields.map((f) => t(`admin.field.${f}`)).join(', '),
                    })}
                  </span>
                )}
              </li>
              <li
                className={validation.provenanceOk ? 'readiness__item is-done' : 'readiness__item'}
              >
                <span>{t('admin.validation.provenance')}</span>
                <span className="readiness__value">
                  {t(validation.provenanceOk ? 'admin.validation.ok' : 'admin.validation.problem')}
                </span>
                {validation.provenanceIssues.map((p) => (
                  <span key={p} className="readiness__note">
                    {t(`admin.provenance.${p}`)}
                  </span>
                ))}
              </li>
              <li
                className={
                  validation.reviewComplete ? 'readiness__item is-done' : 'readiness__item'
                }
              >
                <span>{t('admin.validation.review')}</span>
                <span className="readiness__value">
                  {validation.unreviewedFields.length === 0
                    ? t('admin.validation.ok')
                    : validation.unreviewedFields.length}
                </span>
                <span className="readiness__note">{t('admin.validation.review_note')}</span>
              </li>
              <li className="readiness__item">
                <span>{t('admin.validation.sinhala')}</span>
                <span className="readiness__value">
                  {t(`admin.sinhala.${validation.sinhalaReview}`)}
                </span>
                <span className="readiness__note">{t('admin.validation.sinhala_note')}</span>
              </li>
            </ul>
          </section>

          <section className="card card--safety" aria-labelledby="duplicates-title">
            <h3 id="duplicates-title" className="card__title">
              <Icon name="layers" /> {t('admin.validation.duplicates')}
            </h3>
            {validation.duplicates.length === 0 ? (
              <p className="hint-text">{t('admin.validation.no_duplicates')}</p>
            ) : (
              <ul className="warning-list">
                {validation.duplicates.map((d) => (
                  <li
                    key={`${d.kind}-${d.otherId}`}
                    className={d.blocking ? 'is-blocking' : undefined}
                  >
                    <Icon name="alert" size={16} />{' '}
                    {t(`admin.duplicate.${d.kind}`, {
                      number: d.experimentNumber,
                      title: d.otherTitle ?? '—',
                    })}
                    {d.conflictingTitle && ` ${t('admin.duplicate.conflicting')}`}
                    {d.blocking
                      ? ` ${t('admin.duplicate.blocking')}`
                      : ` ${t('admin.duplicate.info')}`}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card simulation-card" aria-labelledby="simulation-title">
            <h3 id="simulation-title" className="card__title">
              <Icon name="flask" /> {t('admin.simulation.title')}
            </h3>
            <p>
              <span className="badge badge--muted">{t('admin.simulation.pending')}</span>{' '}
              <strong>{t('admin.simulation.not_runnable')}</strong>
            </p>
            <p className="hint-text">
              {t(`admin.simulation.reason.${validation.simulation.reason}`)}
            </p>
            <p className="hint-text">{t('admin.simulation.separate')}</p>
          </section>

          <section className="card" aria-labelledby="actions-title">
            <h3 id="actions-title" className="card__title">
              <Icon name="shield" /> {t('admin.review.actions')}
            </h3>
            <div className="admin-actions">
              <button
                type="button"
                className="button"
                disabled={busy || dirty || draft.status !== 'draft'}
                onClick={() => void act('submit_for_review')}
              >
                {t('admin.action.submit_for_review')}
              </button>
              <button
                type="button"
                className="button button--primary"
                disabled={
                  busy || dirty || draft.status !== 'needs_review' || !validation.canApproveContent
                }
                aria-describedby="approve-help"
                onClick={() => void act('approve_content')}
              >
                {t('admin.action.approve_content')}
              </button>
              <p id="approve-help" className="hint-text">
                {t('admin.action.approve_help')}
              </p>
              <button
                type="button"
                className="button"
                disabled={
                  busy || dirty || !['needs_review', 'content_approved'].includes(draft.status)
                }
                onClick={() => void act('return_to_draft')}
              >
                {t('admin.action.return_to_draft')}
              </button>
              <button
                type="button"
                className="button button--warning"
                disabled={busy || archived}
                onClick={() => {
                  if (window.confirm(t('admin.action.archive_confirm'))) void act('archive');
                }}
              >
                {t('admin.action.archive')}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
