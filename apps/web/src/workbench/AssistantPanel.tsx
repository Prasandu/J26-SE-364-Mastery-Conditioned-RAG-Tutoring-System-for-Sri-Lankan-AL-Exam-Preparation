import { ASSISTANT_QUESTION_MAX_CHARS, type AssistantAnswer } from '@vlab/contracts';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { EngineError } from '../engine/adapter';
import { useSession } from '../store/StoreProvider';

type Status = 'idle' | 'asking' | 'answered' | 'error';

/**
 * Grounded assistant. Sends only the session ID, the question and the locale; the server chooses
 * the evidence. Only the latest answer is kept (no chat history), and nothing here reads or shows
 * the learner's measurements, errors or scores, so manual mode discloses nothing early.
 */
export function AssistantPanel() {
  const { t } = useTranslation();
  const engine = useSession((s) => s.engine);
  const session = useSession((s) => s.session);
  const locale = useSession((s) => s.locale);
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const ids = { title: useId(), field: useId(), hint: useId() };

  if (!session) return null;
  const offline = engine.kind === 'local';
  const trimmed = question.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (offline || trimmed.length < 3 || status === 'asking') return;
    setStatus('asking');
    setErrorKey(null);
    try {
      const result = await engine.askAssistant({
        sessionId: session.sessionId,
        question: trimmed,
        locale,
      });
      setAnswer(result);
      setStatus('answered');
    } catch (error) {
      const code = error instanceof EngineError ? error.code : null;
      setAnswer(null);
      setErrorKey(
        code === 'assistant_unavailable' || code === 'knowledge_unavailable'
          ? 'assistant.error.unavailable'
          : 'assistant.error.generic',
      );
      setStatus('error');
    }
  };

  return (
    <section className="panel assistant" aria-labelledby={ids.title}>
      <h2 id={ids.title}>{t('assistant.title')}</h2>
      <p className="hint-text">{t('assistant.intro')}</p>
      {offline && <p className="hint-text">{t('assistant.offline')}</p>}
      <form onSubmit={(e) => void submit(e)} aria-busy={status === 'asking'}>
        <div className="field">
          <label htmlFor={ids.field}>{t('assistant.question.label')}</label>
          <textarea
            id={ids.field}
            aria-describedby={ids.hint}
            value={question}
            maxLength={ASSISTANT_QUESTION_MAX_CHARS}
            rows={3}
            disabled={offline}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <p id={ids.hint} className="hint-text">
            {t('assistant.question.hint')}
          </p>
        </div>
        <button
          type="submit"
          className="button button--primary"
          disabled={offline || trimmed.length < 3 || status === 'asking'}
        >
          {t('assistant.submit')}
        </button>
      </form>

      <div role="status" aria-live="polite" className="assistant__result">
        {status === 'asking' && <p>{t('assistant.asking')}</p>}
        {status === 'answered' && answer && (
          <article lang={answer.locale} aria-label={t(`assistant.status.${answer.status}`)}>
            <p className="assistant__status">{t(`assistant.status.${answer.status}`)}</p>
            {answer.aiAssistanceLabel && (
              <p className="assistant__ai-label">{t('assistant.aiLabel')}</p>
            )}
            <p className="assistant__answer">{answer.answer}</p>
            {answer.cached && <p className="hint-text">{t('assistant.cached')}</p>}
            {answer.citations.length > 0 && (
              <>
                <h3>{t('assistant.citations')}</h3>
                <ul className="assistant__citations">
                  {answer.citations.map((c) => (
                    <li key={c.chunkId}>
                      {t('assistant.citation.pages', {
                        title: c.documentTitle,
                        year: c.year ?? '',
                        section: c.section,
                        pdfPage: c.pdfPage,
                        printedPage: c.printedPage,
                      })}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>
        )}
      </div>
      {status === 'error' && errorKey && (
        <p role="alert" className="assistant__error">
          {t(errorKey)}
        </p>
      )}
    </section>
  );
}
