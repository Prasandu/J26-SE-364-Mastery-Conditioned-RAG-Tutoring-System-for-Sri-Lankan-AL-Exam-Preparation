import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** One accessible instrument editor, above the bench and clear of the notebook. */
export function StageSetupDialog({
  title,
  stage,
  onClose,
  children,
}: {
  title: string;
  stage: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement;
    dialog.showModal();
    const place = () => {
      const area = stage?.getBoundingClientRect();
      const box = dialog.getBoundingClientRect();
      const centerX = area ? area.left + area.width / 2 : innerWidth / 2;
      const centerY = area ? area.top + area.height / 2 : innerHeight / 2;
      dialog.style.left = `${Math.max(12, Math.min(innerWidth - box.width - 12, centerX - box.width / 2))}px`;
      dialog.style.top = `${Math.max(12, Math.min(innerHeight - box.height - 12, centerY - box.height / 2))}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(dialog);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        requestAnimationFrame(() => previous.focus());
    };
  }, [stage]);
  return (
    <dialog ref={ref} className="instrument-dialog" aria-label={title} onCancel={onClose}>
      <header className="instrument-dialog__head">
        <h2>{title}</h2>
        <button
          type="button"
          className="button"
          onClick={onClose}
          aria-label={t('ui.stage.close_setup')}
        >
          ×
        </button>
      </header>
      <div className="instrument-dialog__body">{children}</div>
    </dialog>
  );
}
