import type { AdminImportResult, AdminStatus } from '@vlab/contracts';
import { useId, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/ui/Icon';
import { StatusMessage } from '../components/ui/StatusMessage';
import { EngineError } from '../engine/adapter';
import type { AdminClient } from './adminClient';

type Phase = 'idle' | 'uploading' | 'extracting' | 'done' | 'error';

const UPLOAD_ERRORS = new Set([
  'request_too_large',
  'unsupported_media_type',
  'document_invalid',
  'document_encrypted',
  'document_too_many_pages',
  'document_no_text',
  'extraction_timeout',
  'extraction_failed',
  'multiple_practicals',
  'network_unavailable',
  'not_found',
]);

/**
 * Import a full Practical Guide or a single practical as DRAFTS. The server validates the file
 * (signature, size, pages, encryption) and extracts text in isolation; nothing is published.
 */
export function ImportPanel({
  client,
  status,
  onImported,
  onOpen,
}: {
  client: AdminClient;
  status: AdminStatus;
  onImported: () => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<'guide' | 'single'>('guide');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AdminImportResult | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const ids = { file: useId(), req: useId() };
  const maxMb = Math.floor(status.limits.maxUploadBytes / (1024 * 1024));
  const localError =
    file && file.size > status.limits.maxUploadBytes
      ? 'request_too_large'
      : file && !/\.pdf$/i.test(file.name) && file.type !== 'application/pdf'
        ? 'not_pdf'
        : null;

  const choose = (f: File | null) => {
    setFile(f);
    setPhase('idle');
    setResult(null);
    setErrorCode(null);
  };
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    choose(e.dataTransfer.files[0] ?? null);
  };
  const start = async () => {
    if (!file || localError) return;
    setPhase('uploading');
    setProgress(0);
    setErrorCode(null);
    try {
      const res = await client.upload(kind, file, (fraction) => {
        setProgress(fraction);
        if (fraction >= 1) setPhase('extracting');
      });
      setResult(res);
      setPhase('done');
      onImported();
    } catch (error) {
      setErrorCode(error instanceof EngineError ? error.code : 'internal_error');
      setPhase('error');
    }
  };
  const busy = phase === 'uploading' || phase === 'extracting';

  return (
    <section aria-labelledby="import-title" className="section admin-import">
      <h2 id="import-title">{t('admin.import.title')}</h2>
      <p className="notice" role="note">
        {t('admin.import.draft_only')}
      </p>
      <fieldset className="mode-options mode-options--two">
        <legend className="visually-hidden">{t('admin.import.kind')}</legend>
        {(['guide', 'single'] as const).map((k) => (
          <div key={k} className={kind === k ? 'mode-option mode-option--selected' : 'mode-option'}>
            <div className="mode-option__head">
              <span className="mode-option__icon">
                <Icon name={k === 'guide' ? 'book' : 'clipboard'} size={24} />
              </span>
              <input
                type="radio"
                id={`import-${k}`}
                name="import-kind"
                checked={kind === k}
                onChange={() => setKind(k)}
                aria-describedby={`import-${k}-desc`}
              />
              <label htmlFor={`import-${k}`}>{t(`admin.import.${k}.title`)}</label>
            </div>
            <p id={`import-${k}-desc`} className="mode-option__desc">
              {t(`admin.import.${k}.description`)}
            </p>
          </div>
        ))}
      </fieldset>

      <label
        htmlFor={ids.file}
        className={dragging ? 'dropzone dropzone--active' : 'dropzone'}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Icon name="layers" size={28} />
        <span className="dropzone__title">{t('admin.import.drop')}</span>
        <span className="hint-text">
          {file ? t('admin.import.selected', { name: file.name }) : t('admin.import.or_choose')}
        </span>
      </label>
      <input
        id={ids.file}
        className="visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        aria-describedby={ids.req}
        onChange={(e) => choose(e.target.files?.[0] ?? null)}
      />
      <ul id={ids.req} className="requirements">
        <li>{t('admin.import.req_pdf')}</li>
        <li>{t('admin.import.req_size', { mb: maxMb })}</li>
        <li>{t('admin.import.req_pages', { pages: status.limits.maxPages })}</li>
        <li>{t('admin.import.req_text')}</li>
      </ul>
      {localError && (
        <p role="alert" className="form-error">
          {t(`admin.error.${localError}`, { mb: maxMb })}
        </p>
      )}
      <div className="button-row">
        <button
          type="button"
          className="button button--primary"
          disabled={!file || !!localError || busy}
          onClick={() => void start()}
        >
          {t('admin.import.start')}
        </button>
      </div>

      {busy && (
        <div className="upload-progress" role="status" aria-live="polite">
          <p>
            {t(phase === 'uploading' ? 'admin.import.uploading' : 'admin.import.extracting', {
              percent: Math.round(progress * 100),
            })}
          </p>
          <span className="meter" aria-hidden="true">
            <span className="meter__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        </div>
      )}
      {phase === 'error' && errorCode && (
        <StatusMessage tone="error" title={t('admin.import.failed')}>
          <p>
            {t(UPLOAD_ERRORS.has(errorCode) ? `admin.error.${errorCode}` : 'admin.error.generic', {
              mb: maxMb,
            })}
          </p>
        </StatusMessage>
      )}
      {phase === 'done' && result && (
        <StatusMessage
          tone="success"
          title={t('admin.import.done', {
            count: result.drafts.length,
            pages: result.import.pageCount,
          })}
        >
          <ul className="item-list">
            {result.drafts.map((d) => (
              <li key={d.id}>
                <button type="button" className="link-button" onClick={() => onOpen(d.id)}>
                  {d.experimentNumber !== null
                    ? t('ui.card.experiment_number', { number: d.experimentNumber })
                    : t('admin.missing_value')}
                  {d.title ? `: ${d.title}` : ''}
                </button>
              </li>
            ))}
          </ul>
        </StatusMessage>
      )}
    </section>
  );
}
