interface Props {
  readonly answered: number;
  readonly total: number;
  // Picks sitting in an uploaded answer sheet's review grid, not yet confirmed -
  // not counted in `answered` (nothing is saved until that button is pressed),
  // but worth saying so filling the sheet doesn't look like nothing happened.
  readonly readyToSave?: number;
}

export function Progress({ answered, total, readyToSave = 0 }: Props) {
  const percent = total === 0 ? 0 : Math.round((answered / total) * 100);

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-slate-600">
        {answered} of {total} answered
        {readyToSave > 0 && (
          <span className="text-brand-700">
            {" "}
            - {readyToSave} more ready in the sheet above, not yet saved
          </span>
        )}
      </p>
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuenow={answered}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className="h-full rounded-full bg-brand-400 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
