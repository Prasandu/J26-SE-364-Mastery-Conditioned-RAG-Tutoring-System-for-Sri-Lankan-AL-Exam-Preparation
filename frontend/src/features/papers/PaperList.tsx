import { Link } from "react-router-dom";

import { listPapers } from "@/api/papers";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { useApi } from "@/hooks/useApi";
import { paperSubtitle } from "@/lib/format";

export function PaperList() {
  const { data: papers, error, loading } = useApi(listPapers, []);

  if (loading) {
    return <Spinner label="Loading papers..." />;
  }
  if (error) {
    return (
      <ErrorBox
        message={error}
        hint="Start the service with: uvicorn app.main:app --reload --port 8001"
      />
    );
  }
  if (!papers?.length) {
    return (
      <Card>
        <p className="text-slate-600">
          No published papers yet. Publish one from the admin API, then refresh.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Papers</h1>
        <p className="mt-1 text-sm text-slate-500">
          {papers.length} published {papers.length === 1 ? "paper" : "papers"}
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {papers.map((paper) => (
          <li key={paper.id}>
            <Link to={`/papers/${paper.id}`} className="block focus:outline-none">
              <Card className="h-full transition hover:border-teal-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-medium">{paper.title}</h2>
                  <Badge tone={paper.kind === "past" ? "neutral" : "good"}>{paper.kind}</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-500">{paperSubtitle(paper)}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
