import { ASSISTANT_QUESTION_MAX_CHARS, type AssistantAnswer } from '@vlab/contracts';
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/ui/Icon';
import { EngineError } from '../engine/adapter';
import { useSession } from '../store/StoreProvider';

type Status = 'idle' | 'asking' | 'answered' | 'error';

/**
 * Grounded assistant, conversation-style. Sends only the session ID, the question and the locale;
 * the server chooses the evidence. Only the current exchange is shown: there is no chat history,
 * nothing is persisted, and each question is answered independently. Nothing here reads or shows
 * the learner's measurements, errors or results, so manual mode discloses nothing early.
 */
export function AssistantPanel() {
  const { t } = useTranslation();
  const engine = useSession((s) => s.engine);
  const session = useSession((s) => s.session);
  const locale = useSession((s) => s.locale);
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const ids = { title: useId(), field: useId(), hint: useId() };

  if (!session) return null;
  const offline = engine.kind === 'local';
  const trimmed = question.trim();

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (offline || trimmed.length < 3 || status === 'asking') return;
    setStatus('asking');
    setErrorKey(null);
    setAsked(trimmed);
    setQuestion('');
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

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter keeps a new line.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <section id="assistant-panel" className="panel assistant" aria-labelledby={ids.title}>
      <header className="assistant__header">
        <span className="assistant__avatar">
          <Icon name="chat" size={20} />
        </span>
        <div>
          <h2 id={ids.title}>{t('assistant.title')}</h2>
          <p className="hint-text">{t('assistant.intro')}</p>
        </div>
      </header>
      {offline && <p className="notice">{t('assistant.offline')}</p>}

      <div className="assistant__thread" role="status" aria-live="polite">
        {asked && (
          <p className="bubble bubble--student" lang={locale}>
            <span className="visually-hidden">{t('assistant.you_asked')} </span>
            {asked}
          </p>
        )}
        {status === 'asking' && (
          <p className="bubble bubble--assistant bubble--pending">{t('assistant.asking')}</p>
        )}
        {status === 'answered' && answer && (
          <article
            className={`bubble bubble--assistant bubble--${answer.status}`}
            lang={answer.locale}
            aria-label={t(`assistant.status.${answer.status}`)}
          >
            <p className="assistant__status">
              <Icon name={answer.status === 'grounded' ? 'book' : 'alert'} size={16} />{' '}
              {t(`assistant.status.${answer.status}`)}
            </p>
            {answer.aiAssistanceLabel && (
              <p className="assistant__ai-label">{t('assistant.aiLabel')}</p>
            )}
            <p className="assistant__answer">{answer.answer}</p>
            {answer.cached && <p className="hint-text">{t('assistant.cached')}</p>}
            {answer.citations.length > 0 && (
              <>
                <h3 className="assistant__sources-title">{t('assistant.citations')}</h3>
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

      <form
        className="assistant__composer"
        onSubmit={(e) => void submit(e)}
        aria-busy={status === 'asking'}
      >
        <label htmlFor={ids.field}>{t('assistant.question.label')}</label>
        <div className="assistant__input-row">
          <textarea
            id={ids.field}
            aria-describedby={ids.hint}
            value={question}
            maxLength={ASSISTANT_QUESTION_MAX_CHARS}
            rows={4}
            disabled={offline}
            placeholder={t('assistant.placeholder')}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            type="submit"
            className="button button--primary"
            disabled={offline || trimmed.length < 3 || status === 'asking'}
          >
            {t('assistant.submit')}
          </button>
        </div>
        <p id={ids.hint} className="hint-text">
          {t('assistant.question.hint')}
        </p>
      </form>
      <p className="ai-disclosure">{t('app.aiNotice')}</p>
    </section>
  );
}
