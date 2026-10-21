import type { CoachingMessage } from "../../api/planning";

export default function CoachingCard({
  message,
}: {
  message: CoachingMessage;
}) {
  return (
    <section
      aria-label="Study coaching"
      className="mt-6 rounded-3xl border border-brand-soft bg-brand-soft/60 p-6 text-ink shadow-card"
    >
      <p className="text-sm font-medium">{message.greeting}</p>
      <h3 className="mt-1 text-lg font-semibold">{message.headline}</h3>
      <p className="mt-2 text-sm">{message.body}</p>
      {message.focus_topics.length ? (
        <div className="mt-3">
          <p className="text-sm font-semibold">Your focus topics</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
            {message.focus_topics.map((topic) => (
              <li key={topic.topic}>
                <span className="font-medium">{topic.topic}:</span>{" "}
                {topic.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 text-sm font-medium">{message.daily_suggestion}</p>
    </section>
  );
}
