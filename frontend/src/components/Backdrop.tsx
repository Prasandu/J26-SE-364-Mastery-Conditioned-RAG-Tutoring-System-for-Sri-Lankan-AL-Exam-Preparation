/** Soft colour behind the whole app, so no page is a flat white sheet. */
export function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-32 -top-40 size-[34rem] rounded-full bg-brand-200/35 blur-3xl" />
      <div className="absolute -right-40 top-20 size-[30rem] rounded-full bg-brand-400/20 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 size-[28rem] rounded-full bg-brand-100/40 blur-3xl" />
    </div>
  );
}
