import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Tone = 'loading' | 'empty' | 'error' | 'success' | 'info';

const ICON: Record<Tone, IconName> = {
  loading: 'layers',
  empty: 'search',
  error: 'alert',
  success: 'check',
  info: 'compass',
};

/**
 * One consistent loading / empty / error / success presentation. Loading and info states are
 * polite live regions; errors are alerts.
 */
export function StatusMessage({
  tone,
  title,
  children,
  action,
}: {
  tone: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={`status-message status-message--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-busy={tone === 'loading' || undefined}
    >
      <span className="status-message__icon">
        <Icon name={ICON[tone]} size={22} />
      </span>
      <div>
        <p className="status-message__title">{title}</p>
        {children && <div className="status-message__body">{children}</div>}
        {action && <div className="status-message__action">{action}</div>}
      </div>
    </div>
  );
}
