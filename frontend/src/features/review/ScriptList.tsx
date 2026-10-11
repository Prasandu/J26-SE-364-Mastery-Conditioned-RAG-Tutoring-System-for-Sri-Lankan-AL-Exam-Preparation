import type { ReviewScript } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";

interface Props {
  scripts: ReviewScript[];
  onOpen: (script: ReviewScript) => void;
}

/** The scripts a teacher can mark right through, and how far each one has got. */
export function ScriptList({ scripts, onOpen }: Props) {
  if (scripts.length === 0) {
    return (
      <Card>
        <p className="text-slate-600">
          No submitted scripts yet. A script appears here once a student presses Submit.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {scripts.map((script) => {
        const done = script.reviewed_points >= script.total_points && script.total_points > 0;
        return (
          <Card key={script.attempt_id}>
            <button
              type="button"
              onClick={() => onOpen(script)}
              className="flex w-full flex-wrap items-center gap-3 text-left"
            >
              <span className="font-medium">{script.student_ref}</span>
              <span className="text-sm text-slate-500">{script.paper_title}</span>
              {done ? (
                <Badge tone="good">marked</Badge>
              ) : (
                <Badge>
                  {script.reviewed_points} of {script.total_points} marked
                </Badge>
              )}
              <span className="ml-auto text-sm tabular-nums text-slate-400">
                machine gave {script.machine_score ?? "-"} / {script.max_score}
              </span>
            </button>
          </Card>
        );
      })}
    </div>
  );
}
