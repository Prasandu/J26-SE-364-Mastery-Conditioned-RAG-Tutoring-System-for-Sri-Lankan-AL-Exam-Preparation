interface Props {
  answered: number;
  total: number;
}

export function Progress({ answered, total }: Props) {
  const percent = total === 0 ? 0 : Math.round((answered / total) * 100);

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-slate-600">
        {answered} of {total} answered
      </p>
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuenow={answered}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className="h-full rounded-full bg-teal-500 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
