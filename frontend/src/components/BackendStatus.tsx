import { apiBaseUrl } from "@/api/client";
import { getHealth } from "@/api/papers";
import { useApi } from "@/hooks/useApi";

/** Green when the assessment service answers, red when it does not. */
export function BackendStatus() {
  const { data, error, loading } = useApi(getHealth, []);

  const tone = loading ? "bg-slate-400" : error ? "bg-rose-500" : "bg-emerald-500";
  const text = loading ? "checking" : error ? "offline" : "connected";

  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-600 backdrop-blur-xs sm:flex whitespace-nowrap shrink-0"
      title={error ? `Cannot reach ${apiBaseUrl}` : (data?.service ?? apiBaseUrl)}
    >
      <span className="relative flex size-2">
        {!error && !loading && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        )}
        <span className={`inline-flex size-2 rounded-full ${tone}`} />
      </span>
      <span>{text}</span>
    </span>
  );
}