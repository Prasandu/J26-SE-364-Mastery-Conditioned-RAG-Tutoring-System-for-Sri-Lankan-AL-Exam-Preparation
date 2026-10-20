import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { listPapers } from "@/api/admin";
import type { AdminPaperSummary, ContentStatus } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState, ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { useApi } from "@/hooks/useApi";

const PAGE_SIZE = 100; // the backend's own ceiling - plenty at this project's scale
const OFFICIAL_KEY = "__official__";
const OFFICIAL_LABEL = "Official papers";

interface Group {
  key: string;
  label: string;
  papers: AdminPaperSummary[];
}

/** Every paper, grouped into one square tile per person who made it (official/shared
 * papers - created_by is empty - get their own tile), 3-4 to a row. Open a tile to
 * see that person's papers. Searchable by title and status across every tile. */
export function PapersListPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ContentStatus | "">("");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(
    (signal: AbortSignal) => loadAllPapers({ search: search || undefined, status: status || undefined }, signal),
    [search, status],
  );
  const { data: papers, error, loading } = useApi(load, [search, status]);

  const groups = useMemo(() => (papers ? groupByCreator(papers) : []), [papers]);
  const selectedGroup = groups.find((group) => group.key === selected) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by title..."
          aria-label="Search papers by title"
          className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as ContentStatus | "")}
          aria-label="Filter by status"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="">Any status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
        {papers && <span className="text-sm text-slate-500">{papers.length} papers</span>}
      </div>

      {loading && <Spinner label="Loading papers..." />}
      {error && <ErrorBox message={error} />}

      {papers && papers.length === 0 && (
        <EmptyState title="No papers match">Try a different search or filter.</EmptyState>
      )}

      {!selectedGroup && groups.length > 0 && (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
          {groups.map((group) => (
            <GroupTile key={group.key} group={group} onOpen={() => setSelected(group.key)} />
          ))}
        </div>
      )}

      {selectedGroup && (
        <div className="space-y-3">
          <Button variant="secondary" onClick={() => setSelected(null)}>
            &larr; All papers
          </Button>
          <Card>
            <p className="font-medium text-slate-900">{selectedGroup.label}</p>
            <ol className="mt-3 divide-y divide-slate-100">
              {selectedGroup.papers.map((paper) => (
                <li key={paper.id} className="py-3 first:pt-0 last:pb-0">
                  <PaperRow paper={paper} />
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}
    </div>
  );
}

/** Fetch every page matching the filter - a handful of requests at most, at this
 * project's scale, and simpler than a second grouped-listing endpoint. */
async function loadAllPapers(
  filter: { search?: string; status?: ContentStatus },
  signal: AbortSignal,
): Promise<AdminPaperSummary[]> {
  const first = await listPapers({ ...filter, page: 1, pageSize: PAGE_SIZE }, signal);
  const items = [...first.items];
  const lastPage = Math.max(1, Math.ceil(first.total / PAGE_SIZE));
  for (let page = 2; page <= lastPage; page += 1) {
    const next = await listPapers({ ...filter, page, pageSize: PAGE_SIZE }, signal);
    items.push(...next.items);
  }
  return items;
}

function groupByCreator(papers: AdminPaperSummary[]): Group[] {
  const byCreator = new Map<string, Group>();
  for (const paper of papers) {
    const key = paper.created_by ?? OFFICIAL_KEY;
    const label = paper.created_by ?? OFFICIAL_LABEL;
    const group = byCreator.get(key);
    if (group) {
      group.papers.push(paper);
    } else {
      byCreator.set(key, { key, label, papers: [paper] });
    }
  }
  return [...byCreator.values()].sort((a, b) => {
    if (a.key === OFFICIAL_KEY) return -1;
    if (b.key === OFFICIAL_KEY) return 1;
    return a.label.localeCompare(b.label);
  });
}

function GroupTile({ group, onOpen }: { readonly group: Group; readonly onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-20 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white p-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
    >
      <p className="line-clamp-2 break-all text-sm font-medium text-slate-900">{group.label}</p>
      <p className="text-xs text-slate-500">
        {group.papers.length} paper{group.papers.length === 1 ? "" : "s"}
      </p>
    </button>
  );
}

const STATUS_TONE = { draft: "warn", published: "good" } as const;

function PaperRow({ paper }: { paper: AdminPaperSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <Link
          to={`/admin/papers/${paper.id}`}
          className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
        >
          {paper.title}
        </Link>
        <p className="mt-0.5 text-xs text-slate-500">
          {paper.kind} {paper.year ?? ""}
        </p>
      </div>
      <Badge>{paper.marking_schemes.length} scheme version(s)</Badge>
      <Badge tone={STATUS_TONE[paper.status]}>{paper.status}</Badge>
    </div>
  );
}
