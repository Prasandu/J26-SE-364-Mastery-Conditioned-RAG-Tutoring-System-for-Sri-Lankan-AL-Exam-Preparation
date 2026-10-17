import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ApiError } from "../../api/client";
import {
  getDashboard,
  submitWhatIf,
  type DashboardResponse,
  type DashboardMasteryHistoryPoint,
  type DashboardTopicTrend,
  type WhatIfResponse,
} from "../../api/planning";
import ErrorState from "../../components/ErrorState";
import LoadingState from "../../components/LoadingState";

const chartColors = {
  brand: "#155e75",
  green: "#059669",
  amber: "#d97706",
  pale: "#e2e8f0",
  target: "#f59e0b",
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function heatColor(mastery: number): string {
  if (mastery >= 0.75) return "bg-emerald-600 text-white";
  if (mastery >= 0.55) return "bg-emerald-300 text-emerald-950";
  if (mastery >= 0.35) return "bg-amber-300 text-amber-950";
  return "bg-rose-300 text-rose-950";
}

function EmptyData({
  children = "Not enough data yet.",
}: {
  children?: ReactNode;
}) {
  return (
    <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
      {children}
    </p>
  );
}

function AdherenceRing({ value }: { value: number }) {
  const percentage = Math.max(0, Math.min(value, 1)) * 100;
  const data = [
    { name: "Completed", value: percentage },
    { name: "Remaining", value: 100 - percentage },
  ];
  return (
    <div className="relative h-48 w-full" aria-label={`Adherence ${Math.round(percentage)} percent`}>
      <ResponsiveContainer height="100%" width="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius="70%"
            outerRadius="90%"
            paddingAngle={2}
            startAngle={90}
            endAngle={-270}
            stroke="none"
          >
            <Cell fill={chartColors.green} />
            <Cell fill={chartColors.pale} />
          </Pie>
          <Tooltip formatter={(entry) => `${Math.round(Number(entry))}%`} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-ink">{Math.round(percentage)}%</span>
        <span className="text-xs text-slate-500">completed</span>
      </div>
    </div>
  );
}

function GradeGauge({
  predicted,
  target,
  predictedGrade,
  targetGrade,
}: {
  predicted: number;
  target: number;
  predictedGrade: string;
  targetGrade: string;
}) {
  const targetValue = Math.max(0, Math.min(target, 1)) * 100;
  const relativeValue = Math.min(predicted / Math.max(target, 0.01), 1) * 100;
  const data = [{ name: "Progress to target", value: relativeValue, fill: chartColors.brand }];
  return (
    <div>
      <div className="relative h-52">
        <ResponsiveContainer height="100%" width="100%">
          <RadialBarChart
            data={data}
            cx="50%"
            cy="78%"
            innerRadius="70%"
            outerRadius="100%"
            barSize={18}
            startAngle={180}
            endAngle={0}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              angleAxisId={0}
              tick={false}
            />
            <RadialBar
              background={{ fill: chartColors.pale }}
              dataKey="value"
              cornerRadius={9}
            />
            <Tooltip formatter={() => `${Math.round(predicted * 100)}%`} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center">
          <p className="text-3xl font-bold text-ink">{predictedGrade}</p>
          <p className="text-sm text-slate-600">
            {Math.round(predicted * 100)}% predicted
          </p>
        </div>
      </div>
      <div className="mt-1 flex justify-between text-sm">
        <span className="text-slate-600">Target: {targetGrade}</span>
        <span className="font-medium text-amber-700">
          {Math.round(targetValue)}% required
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Gauge shows progress toward the target threshold.
      </p>
    </div>
  );
}

function MasteryTrendChart({
  points,
}: {
  points: DashboardMasteryHistoryPoint[];
}) {
  const { chartData, topics } = useMemo(() => {
    const topicById = new Map<string, string>();
    const byWeek = new Map<string, Record<string, number | string>>();
    for (const point of points) {
      topicById.set(
        point.topic_id,
        point.topic_name ?? point.topic_id,
      );
      const week = byWeek.get(point.week_start) ?? {
        week_start: point.week_start,
      };
      week[point.topic_id] = point.mastery * 100;
      byWeek.set(point.week_start, week);
    }
    const selectedTopics = [...topicById.entries()]
      .sort((left, right) => left[1].localeCompare(right[1]))
      .slice(0, 6);
    return {
      chartData: [...byWeek.values()].sort((left, right) =>
        String(left.week_start).localeCompare(String(right.week_start)),
      ),
      topics: selectedTopics,
    };
  }, [points]);
  const weeksWithData = chartData.filter((week) =>
    topics.some(([topicId]) => typeof week[topicId] === "number"),
  ).length;

  if (weeksWithData < 2) {
    return (
      <EmptyData>
        Not enough data yet. Assess the same topic in at least two different
        weeks to see a mastery trend line.
      </EmptyData>
    );
  }
  const colors = ["#155e75", "#059669", "#d97706", "#7c3aed", "#db2777", "#0284c7"];

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
        {topics.map(([topicId, name], index) => (
          <span className="inline-flex items-center gap-2" key={topicId}>
            <span
              className="h-0.5 w-5"
              style={{ backgroundColor: colors[index % colors.length] }}
            />
            {name}
          </span>
        ))}
      </div>
      <div className="h-64 w-full" role="img" aria-label="Weekly mastery trend lines by topic">
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}>
            <XAxis
              dataKey="week_start"
              tick={{ fontSize: 10 }}
              tickFormatter={(value: string) =>
                new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })
              }
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11 }}
              unit="%"
            />
            <Tooltip
              labelFormatter={(value) => `Week of ${String(value)}`}
              formatter={(value) => `${Math.round(Number(value))}%`}
            />
            {topics.map(([topicId], index) => (
              <Line
                connectNulls={false}
                dataKey={topicId}
                key={topicId}
                name={topics[index][1]}
                type="monotone"
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Weekly mastery is recomputed from assessment evidence recorded through
        each week.
      </p>
    </>
  );
}

function SubtopicHeatmap({ topics }: { topics: DashboardTopicTrend[] }) {
  const subtopics = topics.filter((topic) => topic.parent_topic_id !== null);
  const grouped = subtopics.reduce<Record<string, DashboardTopicTrend[]>>(
    (groups, topic) => {
      const parent = topic.parent_topic_id ?? "Other";
      (groups[parent] ??= []).push(topic);
      return groups;
    },
    {},
  );

  if (subtopics.length === 0) {
    return (
      <EmptyData>
        Not enough sub-topic data yet. Mastery will appear here after topic
        assessments are recorded.
      </EmptyData>
    );
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([parentId, children]) => (
        <section key={parentId}>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">
            {parentId}
          </h4>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {children.map((topic) => (
              <li
                aria-label={`${topic.topic_name ?? topic.topic_id}: ${percent(topic.mastery)} mastery`}
                className={`min-h-20 rounded-lg p-3 ${heatColor(topic.mastery)}`}
                key={topic.topic_id}
                title={`${topic.topic_name ?? topic.topic_id}: ${percent(topic.mastery)} mastery`}
              >
                <span className="block text-xs font-medium">
                  {topic.topic_name ?? topic.topic_id}
                </span>
                <span className="mt-2 block text-lg font-bold">
                  {percent(topic.mastery)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
        {[
          ["bg-rose-300", "Below 35%"],
          ["bg-amber-300", "35–54%"],
          ["bg-emerald-300", "55–74%"],
          ["bg-emerald-600", "75% or higher"],
        ].map(([color, label]) => (
          <span className="inline-flex items-center gap-1.5" key={label}>
            <span className={`size-3 rounded-sm ${color}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function DashboardContent({ dashboard }: { dashboard: DashboardResponse }) {
  const [projection, setProjection] = useState<WhatIfResponse | null>(null);
  const [extraHours, setExtraHours] = useState(2);
  const [whatIfError, setWhatIfError] = useState("");
  const [projecting, setProjecting] = useState(false);

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

  const enoughTopics = dashboard.has_mastery_data && dashboard.mastery_trend.length > 0;

  return (
    <section>
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">
        Progress overview
      </p>
      <h2 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">
        Your learning dashboard
      </h2>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-600">Exam countdown</p>
          {dashboard.has_exam_plan ? (
            <p className="mt-3 text-4xl font-bold text-ink">
              {dashboard.exam_countdown_days}
              <span className="ml-2 text-base font-medium text-slate-500">
                days
              </span>
            </p>
          ) : (
            <div className="mt-3">
              <EmptyData>Not enough data yet. Set your exam date.</EmptyData>
              <Link
                className="mt-3 inline-block text-sm font-semibold text-brand underline"
                to="/planning/setup"
              >
                Set up your plan
              </Link>
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-600">
            Study adherence
          </h3>
          {dashboard.has_adherence_data ? (
            <>
              <AdherenceRing value={dashboard.adherence} />
              <p className="text-center text-sm text-slate-600">
                Planned time completed
              </p>
            </>
          ) : (
            <div className="mt-3">
              <EmptyData>
                Not enough data yet. Adherence appears after study sessions are
                scheduled.
              </EmptyData>
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-600">
            Predicted vs target grade
          </h3>
          {dashboard.has_prediction ? (
            <GradeGauge
              predicted={dashboard.predicted_score}
              target={gradeThreshold(dashboard.target_grade)}
              predictedGrade={dashboard.predicted_grade}
              targetGrade={dashboard.target_grade}
            />
          ) : (
            <div className="mt-3">
              <EmptyData>
                Not enough data yet. A prediction needs at least{" "}
                {dashboard.minimum_assessed_topics} assessed{" "}
                {dashboard.minimum_assessed_topics === 1 ? "topic" : "topics"}.
              </EmptyData>
            </div>
          )}
        </article>
      </div>

      {dashboard.achievability ? (
        <section
          aria-label="Plan achievability estimate"
          className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-sky-950">
              Achievability estimate ·{" "}
              {dashboard.achievability.status.replaceAll("_", " ")}
            </h3>
            <span className="text-sm font-medium text-sky-900">
              Best-range grade: {dashboard.achievability.best_range_grade}
            </span>
          </div>
          <p className="mt-2 text-sm text-sky-900">
            {dashboard.achievability.message}
          </p>
          <p className="mt-2 text-sm text-sky-900">
            Estimated {dashboard.achievability.hours_needed} study hours per
            week needed; {dashboard.achievability.hours_available} available.
            Projected score range:{" "}
            {percent(dashboard.achievability.projected_range.low)}–
            {percent(dashboard.achievability.projected_range.high)}.
          </p>
        </section>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-ink">Mastery trend</h3>
          <p className="mb-4 mt-1 text-sm text-slate-600">
            Weekly mastery calculated from assessment evidence
          </p>
          {dashboard.has_mastery_data ? (
            <MasteryTrendChart points={dashboard.mastery_history} />
          ) : (
            <EmptyData>
              Not enough data yet. Assess a topic in at least two different
              weeks to see a mastery trend line.
            </EmptyData>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-ink">Sub-topic mastery</h3>
          <p className="mb-4 mt-1 text-sm text-slate-600">
            Color indicates the latest stored mastery for each sub-topic.
          </p>
          {enoughTopics ? (
            <SubtopicHeatmap topics={dashboard.mastery_trend} />
          ) : (
            <EmptyData>
              Not enough data yet. Sub-topic mastery will appear after
              assessments are recorded.
            </EmptyData>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-lg font-semibold text-ink">Topics to reinforce</h3>
        {dashboard.weak_topics.length === 0 ? (
          <div className="mt-3">
            <EmptyData>
              Not enough data yet. Weak-topic guidance appears after assessments.
            </EmptyData>
          </div>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {dashboard.weak_topics.map((topic) => (
              <li
                className="rounded-xl border border-amber-100 bg-amber-50 p-4"
                key={topic.topic_id}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-ink">
                    {topic.topic_name ?? topic.topic_id}
                  </p>
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-900">
                    {percent(topic.weakness_score)} priority
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{topic.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold text-ink">
            What-if study estimate
          </h3>
          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-sky-900">
            Estimate
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Explore how extra study time could affect your projection. This is an
          estimate, not a guarantee.
        </p>
        {dashboard.has_prediction ? (
          <>
            <label className="mt-5 block max-w-xl text-sm font-medium text-slate-700">
              Extra study time:{" "}
              <span className="font-bold text-brand">
                {extraHours} {extraHours === 1 ? "hour" : "hours"} per week
              </span>
              <input
                className="mt-3 w-full accent-brand"
                max={20}
                min={0}
                onChange={(event) => {
                  setExtraHours(Number(event.target.value));
                  setProjection(null);
                }}
                step={0.5}
                type="range"
                value={extraHours}
              />
              <span className="mt-1 flex justify-between text-xs text-slate-500">
                <span>0 hours</span>
                <span>20 hours</span>
              </span>
            </label>
            <button
              className="mt-4 rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              disabled={projecting}
              onClick={() => void runWhatIf()}
              type="button"
            >
              {projecting ? "Estimating..." : "Calculate estimate"}
            </button>
            {whatIfError ? (
              <div className="mt-4">
                <ErrorState message={whatIfError} />
              </div>
            ) : null}
            {projection ? (
              <div className="mt-4 rounded-xl bg-sky-50 p-4 text-sky-950">
                <p className="text-xs font-bold uppercase tracking-wide">
                  Estimate
                </p>
                <p className="mt-1 font-semibold">
                  Projected grade: {projection.projected_grade}
                </p>
                <p className="mt-1 text-sm">
                  {percent(projection.current_prediction)} current projection
                  {" → "}
                  {percent(projection.projected_prediction)} estimated with{" "}
                  {extraHours} extra weekly hours.
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-4">
            <EmptyData>
              Not enough data yet. Submit an assessment to unlock the what-if
              estimate.
            </EmptyData>
          </div>
        )}
      </section>
    </section>
  );
}

function gradeThreshold(grade: string): number {
  return { A: 0.75, B: 0.65, C: 0.5, S: 0.35, F: 0 }[grade.toUpperCase()] ?? 0.65;
}

export default function PlanningDashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
  return <DashboardContent dashboard={dashboard} />;
}
