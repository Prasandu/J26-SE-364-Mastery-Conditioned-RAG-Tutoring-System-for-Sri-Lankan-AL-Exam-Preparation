import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/ui/Icon';
import type { SceneModel } from './sceneModel';
import { SidePanel } from './SidePanel';

/** Below this width the notebook becomes a sheet instead of a column beside the stage. */
const SHEET_QUERY = '(max-width: 900px)';

/**
 * `matchMedia` is missing in jsdom, where the unit tests render this component. Treating "no
 * matchMedia" as the wide layout keeps those tests on the desktop path — a panel, not a dialog —
 * which is the behaviour they were written against.
 */
const sheetQuery = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(SHEET_QUERY)
    : null;

/**
 * The laboratory notebook: a column beside the stage on a wide screen, and a dismissible
 * full-height sheet on a phone or tablet.
 *
 * On a narrow screen there is not enough width for a 320px notebook and a usable laboratory at
 * the same time, so the panel stacked below the stage and the student had to scroll the whole
 * workbench to reach it. A sheet keeps the stage in place and brings the notebook over it on
 * request.
 *
 * It is a real `<dialog>` opened with `showModal()` rather than a styled `<div>`, because the
 * browser then owns the behaviour that is easy to get wrong by hand: focus is trapped inside the
 * sheet, Escape closes it, the content behind becomes inert to assistive technology, and focus
 * returns to the trigger on close. On a wide screen the same element is rendered non-modally and
 * CSS flattens it back into an ordinary panel, so there is one notebook, one piece of state and
 * no duplicated markup.
 *
 * Opening or closing the sheet is presentation only: it dispatches no engine action and touches
 * no session state, so the experiment cannot advance by looking at the notebook.
 */
export function NotebookSheet({ model }: { model: SceneModel }) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isSheet, setIsSheet] = useState(() => sheetQuery()?.matches ?? false);
  const [open, setOpen] = useState(false);

  // Track the breakpoint so the element can switch between modal sheet and in-flow panel.
  // Growing past the breakpoint also clears `open`, so returning to a narrow width later does not
  // pop the sheet straight back up. That reset lives here, in an event handler, rather than in an
  // effect watching `isSheet` — setting state from an effect triggers cascading renders.
  useEffect(() => {
    const mq = sheetQuery();
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => {
      setIsSheet(e.matches);
      if (!e.matches) setOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Drive the dialog imperatively: `showModal()` is what provides the focus trap and inertness,
  // and it must never be called for the desktop layout.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (isSheet && open) {
      if (!el.open) el.showModal();
    } else if (isSheet) {
      if (el.open) el.close();
    } else {
      // Wide screen: an ordinary, always-visible panel.
      if (el.open) el.close();
      el.setAttribute('open', '');
    }
  }, [isSheet, open]);

  return (
    <>
      {isSheet && (
        <button
          type="button"
          className="button button--primary notebook-drawer__trigger"
          onClick={() => setOpen(true)}
        >
          <Icon name="book" size={16} />
          {t('ui.side.open_notebook')}
        </button>
      )}
      <dialog
        ref={dialogRef}
        className="notebook-drawer"
        aria-label={t('ui.side.notebook')}
        // `cancel` covers Escape; `close` covers every other route out.
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
      >
        {isSheet && (
          <div className="notebook-drawer__head">
            <p className="notebook-drawer__title">{t('ui.side.notebook')}</p>
            <button
              type="button"
              className="notebook-drawer__close"
              onClick={() => setOpen(false)}
              aria-label={t('ui.side.close_notebook')}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        )}
        <SidePanel model={model} />
      </dialog>
    </>
  );
}
