import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  generateSchedule,
  getPlans,
  type PlanResponse,
  type ScheduleResponse,
} from "../../api/planning";
import { ApiError } from "../../api/client";
import ErrorState from "../../components/ErrorState";
import LoadingState from "../../components/LoadingState";

export default function PlanningPage() {
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getPlans();
      setPlans(response.plans);
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
    void loadPlans();
  }, [loadPlans]);

  async function createSchedule(plan: PlanResponse) {
    setGenerating(true);
    setError("");
    try {
      setSchedule(await generateSchedule(plan.id));
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "The study schedule could not be generated.",
      );
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading your study plans..." />;
  }
  if (error && plans.length === 0) {
    return <ErrorState message={error} onRetry={() => void loadPlans()} />;
  }

  const currentPlan = plans[0];
  return (
    <section>
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">
        Your plan
      </p>
      <h2 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">
        Your next study sessions
      </h2>
      {!currentPlan ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-slate-600">
            You have not set up a study plan yet.
          </p>
          <Link
            className="mt-4 inline-flex rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark"
            to="/planning/setup"
          >
            Set up a plan
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-ink">
                {currentPlan.mode === "predicted"
                  ? "Adaptive study plan"
                  : "Custom study plan"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Exam date: {currentPlan.exam_date} · Target grade:{" "}
                {currentPlan.target_grade}
              </p>
            </div>
            <button
              className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              disabled={generating}
              onClick={() => void createSchedule(currentPlan)}
              type="button"
            >
              {generating ? "Generating..." : "Generate next 14 days"}
            </button>
          </div>
          {error ? (
            <div className="mt-5">
              <ErrorState message={error} />
            </div>
          ) : null}
          {schedule ? (
            <div className="mt-6">
              {schedule.infeasible ? (
                <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                  Your availability is limited. {schedule.shortfall_minutes}{" "}
                  minutes could not be scheduled.
                </p>
              ) : null}
              <h3 className="text-lg font-semibold text-ink">Scheduled tasks</h3>
              {schedule.tasks.length === 0 ? (
                <p className="mt-3 rounded-xl border border-slate-200 bg-white p-5 text-slate-600">
                  No sessions were scheduled for this period.
                </p>
              ) : (
                <ul className="mt-3 grid gap-3">
                  {schedule.tasks.map((task, index) => (
                    <li
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between"
                      key={task.id ?? `${task.topic_id}-${index}`}
                    >
                      <div>
                        <p className="font-semibold text-ink">
                          {task.activity} · {task.topic_id}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {new Date(task.start_at).toLocaleString()} ·{" "}
                          {task.duration_min} min
                        </p>
                      </div>
                      <p className="mt-2 text-sm text-slate-500 sm:mt-0">
                        {task.reason}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
