import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/** Keep one live set of renderer controls in the shared viewport header. */
export function ViewControls({
  target,
  children,
}: {
  target?: HTMLElement | null | undefined;
  children: ReactNode;
}) {
  return target ? createPortal(children, target) : children;
}
