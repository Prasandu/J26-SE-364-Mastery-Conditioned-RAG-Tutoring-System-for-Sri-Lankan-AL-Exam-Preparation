/**
 * A file picker that looks like the rest of the form, not the browser's own
 * unstyled "Choose File" control. The real <input type="file"> is still there and
 * still does the work (clicking the button opens it, via the matching <label for>)
 * - only its default appearance is hidden, so it stays keyboard- and
 * screen-reader-accessible.
 */
export function FileField({
  id,
  label,
  accept,
  file,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly accept?: string;
  readonly file: File | null;
  readonly onChange: (file: File | null) => void;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm text-slate-600">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <label
          htmlFor={id}
          className="shrink-0 cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand-300 hover:bg-slate-50"
        >
          Choose file
        </label>
        <span className="truncate text-sm text-slate-500">{file ? file.name : "No file chosen"}</span>
        <input
          id={id}
          type="file"
          accept={accept}
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
          className="sr-only"
        />
      </div>
    </div>
  );
}
