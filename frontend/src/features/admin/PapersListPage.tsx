import { useCallback, useState } from "react";
import { Link } from "react-router-dom";

import { listPapers } from "@/api/admin";
import type { AdminPaperSummary, ContentStatus } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState, ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { useApi } from "@/hooks/useApi";

const PAGE_SIZE = 20;

/** Every paper, searchable by title and status, paginated. */
export function PapersListPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ContentStatus | "">("");
  const [page, setPage] = useState(1);

  const load = useCallback(
    (signal: AbortSignal) =>
      listPapers(
        { search: search || undefined, status: status || undefined, page, pageSize: PAGE_SIZE },
        signal,
      ),
    [search, status, page],
  );
  const { data, error, loading } = useApi(load, [search, status, page]);

  const lastPage = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(event) => {
            setPage(1);
            setSearch(event.target.value);
          }}
          placeholder="Search by title..."
          aria-label="Search papers by title"
          className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
        <select
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value as ContentStatus | "");
          }}
          aria-label="Filter by status"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="">Any status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
        {data && <span className="text-sm text-slate-500">{data.total} papers</span>}
      </div>

      {loading && <Spinner label="Loading papers..." />}
      {error && <ErrorBox message={error} />}

      {data && data.items.length === 0 && (
        <EmptyState title="No papers match">Try a different search or filter.</EmptyState>
      )}

      {data && data.items.length > 0 && (
        <Card>
          <ol className="divide-y divide-slate-100">
            {data.items.map((paper) => (
              <li key={paper.id} className="py-3 first:pt-0 last:pb-0">
                <PaperRow paper={paper} />
              </li>
            ))}
          </ol>
        </Card>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-slate-500">
            Page {page} of {lastPage}
          </span>
          <Button
            variant="secondary"
            disabled={page >= lastPage}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
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
          {paper.created_by && ` - made by ${paper.created_by}`}
        </p>
      </div>
      <Badge>{paper.marking_schemes.length} scheme version(s)</Badge>
      <Badge tone={STATUS_TONE[paper.status]}>{paper.status}</Badge>
    </div>
  );
}
