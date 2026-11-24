import { useCallback } from "react";
import { Link } from "react-router-dom";

import { listPapers, listTopicSuggestions } from "@/api/admin";
import { listResources } from "@/api/resources";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Card } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { CardSkeleton } from "@/components/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/hooks/useApi";

const TASKS = [
  {
    to: "/admin/import",
    title: "Import a past paper or scheme",
    body: "Upload a scanned PDF, review what the model read, then create the paper or the next scheme version.",
  },
  {
    to: "/admin/past-papers",
    title: "Add a past paper (PDF)",
    body: "Upload the real exam PDF and type a skeleton for its questions - students see the PDF itself.",
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
  const { user } = useAuth();

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

  const firstName = user?.name.split(" ")[0];

  if (loading) {
    return (
      <div className="space-y-8">
        <Header firstName={firstName} />
        <CardSkeleton rows={4} />
        <CardSkeleton rows={2} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-8">
        <Header firstName={firstName} />
        <ErrorBox message={error ?? "Could not load the dashboard"} />
      </div>
    );
  }

  const draftPapers = data.papers.items.filter((paper) => paper.status === "draft").length;
  const schemesNeedingWork = data.papers.items.filter((paper) =>
    paper.marking_schemes.some((scheme) => scheme.status === "draft" || scheme.status === "validation_failed"),
  ).length;
  const unpublishedResources = data.resources.filter((resource) => resource.status === "draft").length;
  const pendingSuggestions = data.pendingSuggestions.length;

  const attention = [
    draftPapers > 0 && {
      to: "/admin/papers",
      text: `${draftPapers} paper${draftPapers === 1 ? "" : "s"} still in draft`,
    },
    schemesNeedingWork > 0 && {
      to: "/admin/papers",
      text: `${schemesNeedingWork} marking scheme${schemesNeedingWork === 1 ? "" : "s"} need${schemesNeedingWork === 1 ? "s" : ""} work`,
    },
    pendingSuggestions > 0 && {
      to: "/admin/suggestions",
      text: `${pendingSuggestions} topic suggestion${pendingSuggestions === 1 ? "" : "s"} waiting for review`,
    },
    unpublishedResources > 0 && {
      to: "/admin/resources",
      text: `${unpublishedResources} resource book${unpublishedResources === 1 ? "" : "s"} not yet published`,
    },
  ].filter((item): item is { to: string; text: string } => Boolean(item));

  return (
    <div className="space-y-8">
      <Header firstName={firstName} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Papers" value={data.papers.total} count={draftPapers} countLabel="draft" />
        <Stat
          label="Topic suggestions"
          value={pendingSuggestions}
          to="/admin/suggestions"
          count={pendingSuggestions}
          countLabel="pending"
        />
        <Stat label="Marking schemes" value={schemesNeedingWork} count={schemesNeedingWork} countLabel="need work" />
        <Stat
          label="Resource books"
          value={data.resources.length}
          count={unpublishedResources}
          countLabel="unpublished"
        />
      </div>

      {attention.length > 0 && (
        <Card className="border-amber-200/80 bg-amber-50/70">
          <h2 className="text-sm font-medium text-amber-900">Needs attention</h2>
          <ul className="mt-2 space-y-1.5">
            {attention.map((item) => (
              <li key={item.text}>
                <Link
                  to={item.to}
                  className="flex items-center gap-2 text-sm text-amber-800 hover:text-amber-950 hover:underline"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">Quick actions</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

function Header({ firstName }: { readonly firstName: string | undefined }) {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">
        {firstName ? `Welcome back, ${firstName}` : "Dashboard"}
      </h1>
      <p className="mt-1 text-sm text-slate-500">An overview of what the content needs from you.</p>
    </div>
  );
}

function Stat({
  label,
  value,
  to,
  count,
  countLabel,
}: {
  readonly label: string;
  readonly value: number;
  readonly to?: string;
  readonly count: number;
  readonly countLabel: string;
}) {
  const tone: BadgeTone = count > 0 ? "warn" : "neutral";
  const content = (
    <Card className="h-full">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
        <Badge tone={tone}>{count > 0 ? countLabel : "all clear"}</Badge>
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </Card>
  );
  return to ? (
    <Link to={to} className="block h-full transition hover:-translate-y-0.5">
      {content}
    </Link>
  ) : (
    content
  );
}
