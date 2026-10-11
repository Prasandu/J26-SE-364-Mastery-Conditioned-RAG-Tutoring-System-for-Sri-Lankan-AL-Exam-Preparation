import { apiBaseUrl } from "@/api/client";
import { getHealth } from "@/api/papers";
import { useApi } from "@/hooks/useApi";

/** Green when the assessment service answers, red when it does not. */
export function BackendStatus() {
  const { data, error, loading } = useApi(getHealth, []);

  const tone = loading ? "bg-slate-400" : error ? "bg-rose-500" : "bg-brand-400";
  const text = loading ? "checking" : error ? "offline" : "connected";

  return (
    <span
      className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 sm:flex"
      title={error ? `Cannot reach ${apiBaseUrl}` : (data?.service ?? apiBaseUrl)}
    >
      <span className={`size-2 rounded-full ${tone}`} />
      {text}
    </span>
  );
}
