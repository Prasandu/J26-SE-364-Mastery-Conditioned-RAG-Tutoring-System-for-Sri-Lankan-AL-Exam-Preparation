import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import {
  getDashboard,
  submitWhatIf,
  type DashboardResponse,
  type WhatIfResponse,
} from "../../api/planning";
import ErrorState from "../../components/ErrorState";
import LoadingState from "../../components/LoadingState";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function PlanningDashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [projection, setProjection] = useState<WhatIfResponse | null>(null);
  const [extraHours, setExtraHours] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [whatIfError, setWhatIfError] = useState("");
  const [projecting, setProjecting] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDashboard(await getDashboard());
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Please check the planning service connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  async function runWhatIf() {
    setProjecting(true);
    setWhatIfError("");
    try {
      setProjection(await submitWhatIf({ extra_hours_per_week: extraHours }));
    } catch (cause) {
      setWhatIfError(
        cause instanceof ApiError
          ? cause.message
          : "The estimate could not be generated.",
      );
    } finally {
      setProjecting(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading your progress dashboard..." />;
  }
  if (error || !dashboard) {
    return (
      <ErrorState
        message={error || "No dashboard data is available."}
        onRetry={() => void loadDashboard()}
      />
    );
  }

  const stats = [
    { label: "Days until exam", value: String(dashboard.exam_countdown_days) },
    { label: "Study adherence", value: `${Math.round(dashboard.adherence_pct)}%` },
    {
      label: "Predicted grade",
      value: `${dashboard.predicted_grade} / ${dashboard.target_grade}`,
    },
    { label: "Readiness", value: percent(dashboard.readiness_score) },
  ];

  return (
    <section>
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">
        Progress overview
      </p>
      <h2 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">
        Your learning dashboard
      </h2>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <article
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            key={stat.label}
          >
            <p className="text-sm text-slate-600">{stat.label}</p>
            <p className="mt-2 text-2xl font-bold text-ink">{stat.value}</p>
          </article>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-ink">Topic mastery</h3>
          {dashboard.mastery_trend.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              Mastery trends will appear after you complete assessments.
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {dashboard.mastery_trend.map((topic) => (
                <li key={topic.topic_id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-ink">
                      {topic.topic_name ?? topic.topic_id}
                    </span>
                    <span className="shrink-0 text-sm text-slate-600">
                      {percent(topic.mastery)}
                    </span>
                  </div>
                  <div
                    aria-label={`${topic.topic_name ?? topic.topic_id} mastery`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={Math.round(topic.mastery * 100)}
                    className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
                    role="progressbar"
                  >
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${topic.mastery * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Trend: {topic.trend >= 0 ? "+" : ""}
                    {Math.round(topic.trend * 100)}%
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-ink">Topics to reinforce</h3>
          {dashboard.weak_topics.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              No weak topics are available yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {dashboard.weak_topics.map((topic) => (
                <li className="py-3 first:pt-0" key={topic.topic_id}>
                  <p className="font-semibold text-ink">
                    {topic.topic_name ?? topic.topic_id}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{topic.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-lg font-semibold text-ink">Try a what-if estimate</h3>
        <p className="mt-1 text-sm text-slate-600">
          Explore how extra weekly study time could affect your projected grade.
          This is an estimate, not a guarantee.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block text-sm font-medium text-slate-700">
            Extra hours per week
            <input
              className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 sm:w-48"
              min={0}
              onChange={(event) => setExtraHours(Number(event.target.value))}
              step={0.5}
              type="number"
              value={extraHours}
            />
          </label>
          <button
            className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            disabled={projecting}
            onClick={() => void runWhatIf()}
            type="button"
          >
            {projecting ? "Estimating..." : "Estimate my grade"}
          </button>
        </div>
        {whatIfError ? (
          <div className="mt-4">
            <ErrorState message={whatIfError} />
          </div>
        ) : null}
        {projection ? (
          <p className="mt-4 rounded-xl bg-sky-50 p-4 text-sm text-sky-950">
            Estimate: {projection.current_grade} to{" "}
            {projection.projected_grade} ({percent(projection.projected_prediction)}
            ). Projected score will not be lower than your current prediction.
          </p>
        ) : null}
        <p className="mt-3 text-sm text-slate-600">
          Score gap to target: {dashboard.gap_to_target >= 0 ? "+" : ""}
          {Math.round(dashboard.gap_to_target * 100)} points
        </p>
      </section>
    </section>
  );
}
