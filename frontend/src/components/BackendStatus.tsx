import { apiBaseUrl } from "@/api/client";
import { getHealth } from "@/api/papers";
import { useApi } from "@/hooks/useApi";

/** Green when the assessment service answers, red when it does not. */
export function BackendStatus() {
  const { data, error, loading } = useApi(getHealth, []);

  const tone = loading ? "bg-slate-400" : error ? "bg-rose-500" : "bg-teal-500";
  const text = loading ? "checking..." : error ? "backend offline" : (data?.service ?? "connected");

  return (
    <span className="flex items-center gap-2 text-xs text-slate-500" title={apiBaseUrl}>
      <span className={`size-2 rounded-full ${tone}`} />
      {text}
    </span>
  );
}
