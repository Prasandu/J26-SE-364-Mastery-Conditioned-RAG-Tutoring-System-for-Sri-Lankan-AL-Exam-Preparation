import type { Intervention } from "../../types/intervention";

export function InterventionPanel({ interventions }: { interventions: Intervention[] }) {
  if (interventions.length === 0) {
    return (
      <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
        No particular struggles detected yet — keep going!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {interventions.map((i, idx) => (
        <div key={idx} className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          {i.message}
        </div>
      ))}
    </div>
  );
}
