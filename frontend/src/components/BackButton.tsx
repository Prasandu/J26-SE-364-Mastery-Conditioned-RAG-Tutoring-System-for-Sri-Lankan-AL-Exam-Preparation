import { useLocation, useNavigate } from "react-router-dom";

interface BackButtonProps {
  readonly fallbackTo?: string;
  readonly label?: string;
}

export function BackButton({ fallbackTo = "/", label = "Back" }: BackButtonProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (pathname === "/") {
    return null;
  }

  function goBack() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate(fallbackTo);
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm backdrop-blur transition hover:border-brand-200 hover:bg-white hover:text-brand-700"
      aria-label={label}
    >
      <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
        <path
          d="M15.5 10H4.5m0 0 4-4m-4 4 4 4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{label}</span>
    </button>
  );
}