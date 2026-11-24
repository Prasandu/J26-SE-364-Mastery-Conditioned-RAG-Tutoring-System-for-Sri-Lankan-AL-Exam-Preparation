import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { checkWrittenAnswer } from '../engine/localAdapter';

/** Checking is explicit. Editing invalidates feedback; no guide is revealed while typing. */
export function WrittenAnswerCheck({
  value,
  questionKey = null,
  guide = null,
}: {
  value: string;
  questionKey?: string | null;
  guide?: { en: string; si: string } | null;
}) {
  const { t, i18n } = useTranslation();
  const [submitted, setSubmitted] = useState<string | null>(null);
  const result =
    submitted === value
      ? checkWrittenAnswer(value, questionKey, i18n.language === 'si' ? 'si' : 'en')
      : null;
  return (
    <div className="written-answer-check">
      <button
        className="button"
        type="button"
        disabled={!value.trim()}
        onClick={() => setSubmitted(value)}
      >
        {t('ui.answers.check')}
      </button>
      {result && (
        <div role="status" lang={result.locale}>
          <p>{t(`ui.answers.${result.status}`, { lng: result.locale })}</p>
          <p className="hint-text">{t('ui.answers.scope', { lng: result.locale })}</p>
          {guide && (
            <details>
              <summary>{t('ui.answers.guide', { lng: result.locale })}</summary>
              <p>{guide[result.locale]}</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
