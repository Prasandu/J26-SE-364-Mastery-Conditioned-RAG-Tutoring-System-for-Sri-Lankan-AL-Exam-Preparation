import { useCallback } from "react";
import { Link } from "react-router-dom";

import { listPapers, listTopicSuggestions } from "@/api/admin";
import { listResources } from "@/api/resources";
import { Card } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { useApi } from "@/hooks/useApi";

const TASKS = [
  {
    to: "/admin/import",
    title: "Import a past paper or scheme",
    body: "Upload a scanned PDF, review what the model read, then create the paper or the next scheme version.",
  },
  {
    to: "/admin/resources",
    title: "Upload a resource book",
    body: "Add trusted reference material for question generation to ground itself in.",
  },
  {
    to: "/admin/generate",
    title: "Generate a model paper",
    body: "Write a new paper with AI, then check and publish it.",
  },
  {
    to: "/admin/suggestions",
    title: "Review AI topic suggestions",
    body: "Approve or reject the syllabus tags the classifier proposed.",
  },
  {
    to: "/admin/users",
    title: "Manage user accounts",
    body: "Review registrations, assign roles, and control account access.",
  },
];

/** What needs attention, and the day-to-day content tasks, at a glance. */
export function AdminDashboard() {
  const load = useCallback(async (signal: AbortSignal) => {
    // pageSize is generous rather than exhaustive: enough to compute an honest
    // overview at the project's current scale, without paging through everything
    // just to show a dashboard.
    const [papers, pendingSuggestions, resources] = await Promise.all([
      listPapers({ pageSize: 100 }, signal),
      listTopicSuggestions("pending", signal),
      listResources(signal),
    ]);
    return { papers, pendingSuggestions, resources };
  }, []);

  const { data, error, loading } = useApi(load, []);

  if (loading) {
    return <Spinner label="Loading the dashboard..." />;
  }
  if (error || !data) {
    return <ErrorBox message={error ?? "Could not load the dashboard"} />;
  }

  const draftPapers = data.papers.items.filter((paper) => paper.status === "draft").length;
  const schemesNeedingWork = data.papers.items.filter((paper) =>
    paper.marking_schemes.some((scheme) => scheme.status === "draft" || scheme.status === "validation_failed"),
  ).length;
  const unpublishedResources = data.resources.filter((resource) => resource.status === "draft").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">An overview of what the content needs from you.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Papers" value={data.papers.total} hint={`${draftPapers} still draft`} />
        <Stat label="Pending topic suggestions" value={data.pendingSuggestions.length} to="/admin/suggestions" />
        <Stat label="Schemes needing work" value={schemesNeedingWork} hint="draft or validation failed" />
        <Stat label="Resource books" value={data.resources.length} hint={`${unpublishedResources} not yet published`} />
      </div>

      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">Tasks</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {TASKS.map((task) => (
            <Link key={task.to} to={task.to}>
              <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-xl">
                <h3 className="font-medium text-slate-900">{task.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{task.body}</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  to,
}: {
  readonly label: string;
  readonly value: number;
  readonly hint?: string;
  readonly to?: string;
}) {
  const content = (
    <Card>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}
