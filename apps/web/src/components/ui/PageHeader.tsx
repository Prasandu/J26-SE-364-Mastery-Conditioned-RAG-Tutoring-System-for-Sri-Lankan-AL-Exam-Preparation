import type { ReactNode } from 'react';

/** Consistent page heading: optional eyebrow, the single h1, a lead line and optional actions. */
export function PageHeader({
  id,
  title,
  eyebrow,
  lead,
  actions,
  media,
  children,
}: {
  id: string;
  title: string;
  eyebrow?: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  /** Decorative illustration beside the heading. */
  media?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        {eyebrow && <p className="page-header__eyebrow">{eyebrow}</p>}
        <h1 id={id}>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
        {children}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
      {media && <div className="page-header__media">{media}</div>}
    </header>
  );
}
