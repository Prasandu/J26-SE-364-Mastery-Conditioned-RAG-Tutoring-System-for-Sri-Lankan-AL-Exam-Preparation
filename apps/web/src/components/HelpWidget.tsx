import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../store/StoreProvider';
import { AssistantPanel } from '../workbench/AssistantPanel';
import { Icon } from './ui/Icon';

/**
 * Floating "Need help?" assistant, reachable from every step of the practical flow instead of
 * being one tab among others. `AssistantPanel` itself is unchanged: it still only answers an
 * explicit question from the approved sources. Minimizing hides the popup without losing a
 * half-typed question or the last answer (the panel stays the same component instance); only
 * "End chat" resets it, by remounting with a fresh key.
 */
export function HelpWidget() {
  const { t } = useTranslation();
  const session = useSession((s) => s.session);
  const [open, setOpen] = useState(false);
  const [instance, setInstance] = useState(0);

  if (!session) return null;

  const endChat = () => {
    setInstance((n) => n + 1);
    setOpen(false);
  };

  return (
    <div className="help-widget">
      {open ? (
        <div className="help-widget__panel">
          <div className="help-widget__controls">
            <button type="button" className="help-widget__text-button" onClick={endChat}>
              {t('assistant.end_chat')}
            </button>
            <button
              type="button"
              className="help-widget__close"
              aria-label={t('assistant.minimize')}
              title={t('assistant.minimize')}
              onClick={() => setOpen(false)}
            >
              −
            </button>
          </div>
          <div className="help-widget__body">
            <AssistantPanel key={instance} />
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="help-widget__launcher"
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          <Icon name="chat" size={18} />
          <span>{t('assistant.help_button')}</span>
        </button>
      )}
    </div>
  );
}
