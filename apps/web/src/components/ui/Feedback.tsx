import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

/**
 * App-wide transient messages and themed confirmations.
 *
 * The laboratory already had `StageFeedback`, but it is bound to the engine's own feedback for the
 * current session, so the admin console had nothing and fell back to `window.confirm` — an
 * unstyled operating-system dialog in the middle of the Chemistry Studio theme, with no way to
 * carry a result message afterwards.
 *
 * Two different jobs, kept separate on purpose:
 *   - `toast` reports something that already happened. It is transient and cannot be answered.
 *   - `confirm` asks a question and resolves to the answer. A destructive admin action (approving
 *     a batch of drafts, archiving one) keeps a real gate, because a toast cannot hold a decision
 *     and those operations are not reversible from the interface.
 */

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ConfirmRequest {
  message: string;
  /** Marks the action as destructive, which colours the confirm button. */
  destructive?: boolean;
  resolve: (ok: boolean) => void;
}

interface FeedbackApi {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (message: string, options?: { destructive?: boolean }) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

/** How long a toast stays before it removes itself; matches the laboratory's own toast timing. */
const TOAST_MS = 6000;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ask, setAsk] = useState<ConfirmRequest | null>(null);
  const nextId = useRef(0);

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = (nextId.current += 1);
    setToasts((list) => [...list, { id, tone, message }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), TOAST_MS);
  }, []);

  const confirm = useCallback(
    (message: string, options?: { destructive?: boolean }) =>
      new Promise<boolean>((resolve) => {
        setAsk({ message, destructive: options?.destructive ?? false, resolve });
      }),
    [],
  );

  const settle = useCallback(
    (ok: boolean) => {
      ask?.resolve(ok);
      setAsk(null);
    },
    [ask],
  );

  const api = useMemo<FeedbackApi>(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      {/* Errors interrupt; everything else is announced politely. */}
      <div className="toast-stack">
        {toasts.map((x) => (
          <p
            key={x.id}
            className={`stage-toast app-toast app-toast--${x.tone}`}
            role={x.tone === 'error' ? 'alert' : 'status'}
          >
            {x.message}
          </p>
        ))}
      </div>
      {ask && (
        <div className="dialog-backdrop">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="feedback-confirm-body"
            className={ask.destructive ? 'dialog dialog--safety' : 'dialog'}
            onKeyDown={(e) => {
              if (e.key === 'Escape') settle(false);
            }}
          >
            <h2 id="feedback-confirm-body">{ask.message}</h2>
            <div className="dialog__actions">
              {/* Cancel takes focus: the safe answer is the default one. */}
              <button type="button" className="button" onClick={() => settle(false)} autoFocus>
                {t('ui.confirm.cancel')}
              </button>
              <button
                type="button"
                className={ask.destructive ? 'button button--warning' : 'button button--primary'}
                onClick={() => settle(true)}
              >
                {t('ui.confirm.continue')}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

/**
 * Outside the provider (unit tests that render a single component) this degrades to a no-op
 * toast and a confirm that declines, so a test never blocks on an unanswered dialog.
 */
export function useFeedback(): FeedbackApi {
  return (
    useContext(FeedbackContext) ?? {
      toast: () => {},
      confirm: () => Promise.resolve(false),
    }
  );
}
