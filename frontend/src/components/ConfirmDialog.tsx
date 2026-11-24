import type { ReactNode } from "react";
import Modal from "./Modal";

/** In-app replacement for window.confirm(): same look as the rest of the planner. */
export default function ConfirmDialog({
  id,
  title,
  children,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  id: string;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal labelledBy={id} onClose={onCancel}>
      <h3 className="text-xl font-bold" id={id}>
        {title}
      </h3>
      <div className="mt-2 space-y-2 text-sm text-slate-600">{children}</div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          {cancelLabel}
        </button>
        <button
          autoFocus
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
