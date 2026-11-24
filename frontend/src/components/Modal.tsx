import { useEffect, useRef, type ReactNode } from "react";

const sizes = { md: "max-w-md", lg: "max-w-lg" } as const;

/**
 * Shared pop-up shell in the planner's look: dimmed backdrop, rounded white
 * card, soft shadow. Escape closes it and the page behind it does not scroll.
 */
export default function Modal({
  labelledBy,
  onClose,
  size = "md",
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  size?: keyof typeof sizes;
  children: ReactNode;
}) {
  // Keep the latest handler in a ref so the listener is attached once, not on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      aria-labelledby={labelledBy}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      role="dialog"
    >
      <section
        className={`max-h-[90vh] w-full ${sizes[size]} overflow-y-auto rounded-3xl border border-slate-100 bg-white p-6 text-ink shadow-card sm:p-7`}
      >
        {children}
      </section>
    </div>
  );
}
