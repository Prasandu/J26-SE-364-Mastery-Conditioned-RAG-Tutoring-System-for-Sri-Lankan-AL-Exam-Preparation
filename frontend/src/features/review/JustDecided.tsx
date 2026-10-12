import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";

import { DecisionHistory } from "./DecisionHistory";

export interface Decided {
  id: number;
  question: string;
  code: string;
  teacherAwarded: boolean;
  aiAwarded: boolean | null;
  blind: boolean;
}

/**
 * What the machine had said, shown only after the teacher committed.
 *
 * The teacher still gets to see whether they matched it, but too late for it to
 * change the decision.
 */
export function JustDecided({ decisions }: { decisions: Decided[] }) {
  if (decisions.length === 0) {
    return null;
  }
  const blind = decisions.filter((decision) => decision.blind).length;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">Decided in this session</h2>
        <span className="text-sm text-slate-500">
          {blind} of {decisions.length} decided without looking first
        </span>
      </div>

      <ul className="mt-3 divide-y divide-slate-100 text-sm">
        {decisions.map((decision) => {
          const agreed = decision.aiAwarded === decision.teacherAwarded;
          return (
            <li key={decision.id} className="py-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-20 font-mono text-brand-700">
                  {decision.question} {decision.code}
                </span>
                <span className="text-slate-600">
                  you said <strong>{decision.teacherAwarded ? "award" : "do not award"}</strong>
                </span>
                {decision.aiAwarded === null ? (
                  <span className="text-slate-400">the AI did not judge this point</span>
                ) : (
                  <>
                    <span className="text-slate-600">
                      AI said <strong>{decision.aiAwarded ? "award" : "do not award"}</strong>
                    </span>
                    <Badge tone={agreed ? "good" : "warn"}>{agreed ? "agreed" : "disagreed"}</Badge>
                  </>
                )}
                {!decision.blind && <Badge>looked first</Badge>}
              </div>
              <div className="mt-1 pl-20">
                <DecisionHistory resultId={decision.id} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
