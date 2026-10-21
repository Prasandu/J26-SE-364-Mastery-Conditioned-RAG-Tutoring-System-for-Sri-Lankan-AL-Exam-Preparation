import type {
  RoadmapResponse,
  RoadmapWeek,
  RollingUpdateResponse,
  TargetChoiceOption,
} from "../../api/planning";

function shortDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 2) / 2;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}h`;
}

export function checkpointReasonText(
  trigger: RollingUpdateResponse["trigger"],
): string {
  if (trigger === "window_end") return "Your committed study window ended.";
  if (trigger === "new_evidence") return "New assessment results arrived.";
  if (trigger === "target_choice") return "You chose how to continue.";
  return "Your plan was refreshed.";
}

function WeekCard({ week }: { week: RoadmapWeek }) {
  const committed = week.label === "committed";
  const finalWeek = week.phase === "final_revision";
  return (
    <li
      className={`rounded-xl border p-4 ${
        committed
          ? "border-brand/30 bg-white"
          : "border-dashed border-slate-300 bg-slate-50"
      }`}
      data-label={week.label}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">
          Week of {shortDate(week.week_start)}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
          <span
            className={`rounded-full px-2 py-0.5 ${
              committed
                ? "bg-sky-100 text-sky-900"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {committed ? "Committed" : "Forecast"}
          </span>
          {finalWeek ? (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-900">
              Final revision
            </span>
          ) : null}
          <span className="text-slate-600">
            {formatHours(week.total_hours)} total
          </span>
        </div>
      </div>
      {week.topics.length ? (
        <ul className="mt-2 grid gap-1 text-sm text-slate-700">
          {week.topics.map((topic) => (
            <li
              className="flex flex-wrap justify-between gap-x-3"
              key={topic.topic_id}
            >
              <span className="min-w-0 break-words font-medium">
                {topic.topic_name}
              </span>
              <span className="text-slate-500">
                {formatHours(topic.hours)} · {topic.focus}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          No study time available this week.
        </p>
      )}
    </li>
  );
}

export function CheckpointNotice({
  update,
}: {
  update: RollingUpdateResponse;
}) {
  return (
    <section
      aria-live="polite"
      aria-label="Plan checkpoint"
      className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-950"
      role="status"
    >
      <p className="font-semibold">
        {update.trigger === "target_choice"
          ? "Plan updated"
          : "Checkpoint: your plan was rebuilt"}
      </p>
      <p className="mt-1 text-sm">{checkpointReasonText(update.trigger)}</p>
      {update.adherence !== null && update.trigger !== "target_choice" ? (
        <p className="mt-1 text-sm">
          Last week you completed {Math.round(update.adherence * 100)}% of your
          planned study time.
        </p>
      ) : null}
      {update.range_change ? (
        <p className="mt-1 text-sm">{update.range_change.message}</p>
      ) : null}
      {update.explanation && update.trigger === "target_choice" ? (
        <p className="mt-1 text-sm">{update.explanation}</p>
      ) : null}
    </section>
  );
}

export default function RoadmapSection({
  roadmap,
  choosing,
  onChooseTarget,
}: {
  roadmap: RoadmapResponse;
  choosing: boolean;
  onChooseTarget: (choice: TargetChoiceOption) => void;
}) {
  const committedWeeks = roadmap.weeks.filter(
    (week) => week.label === "committed",
  ).length;

  return (
    <section aria-label="Roadmap to your exam" className="mt-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h3 className="text-lg font-semibold text-ink">Roadmap to your exam</h3>
        <p className="text-sm text-slate-600">
          {roadmap.days_to_exam} days left · {roadmap.weeks.length}{" "}
          {roadmap.weeks.length === 1 ? "week" : "weeks"}
        </p>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {roadmap.window_end
          ? `Your next ${roadmap.window_days} days are detailed in your study sessions. `
          : `Generate your next ${roadmap.window_days} days to get detailed sessions. `}
        Later weeks are a forecast of hours per topic and are rebuilt at each
        checkpoint
        {roadmap.next_checkpoint
          ? ` (next checkpoint: ${shortDate(roadmap.next_checkpoint)})`
          : ""}
        .
      </p>

      {roadmap.final_week ? (
        <p className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
          Final week: revision, past papers and weak-topic fixes only, with no
          new theory. Your plan stays fixed until the exam.
        </p>
      ) : null}

      {roadmap.compression_note ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <p className="font-semibold">Your plan is lighter for now</p>
          <p className="mt-1 text-sm">{roadmap.compression_note}</p>
          {roadmap.target_choice ? (
            <div className="mt-3">
              <p className="text-sm font-semibold">How would you like to continue?</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <button
                  className="rounded-full bg-brand px-3 py-2 text-left text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                  disabled={choosing}
                  onClick={() => onChooseTarget("keep_target")}
                  type="button"
                >
                  {roadmap.target_choice.keep_target.label}
                </button>
                <button
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-60"
                  disabled={choosing}
                  onClick={() => onChooseTarget("adjust_goal")}
                  type="button"
                >
                  {roadmap.target_choice.adjust_goal.label}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {roadmap.weeks.length ? (
        <ol className="mt-4 grid gap-3 md:grid-cols-2">
          {roadmap.weeks.map((week) => (
            <WeekCard key={week.week_start} week={week} />
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-3xl border border-slate-100 bg-white shadow-card p-5 text-slate-600">
          Your roadmap will appear once your plan has topics and study time.
        </p>
      )}
      {committedWeeks === 0 && roadmap.weeks.length ? (
        <p className="mt-2 text-xs text-slate-500">
          All weeks are a forecast until you generate your next study window.
        </p>
      ) : null}
    </section>
  );
}
