import { useState } from "react";
import { Link } from "react-router-dom";

import {
  approveScheme,
  copyScheme,
  deleteScheme,
  publishScheme,
  retireScheme,
  validateScheme,
} from "@/api/admin";
import { ApiError } from "@/api/client";
import type { SchemeStatus, SchemeSummary } from "@/api/types";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, SectionHeading } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { when } from "@/lib/format";
import { readAdminRef, saveAdminRef } from "@/lib/teacher";

const STATUS_TONE: Record<SchemeStatus, BadgeTone> = {
  draft: "neutral",
  validation_failed: "bad",
  validated: "good",
  approved: "good",
  published: "good",
  retired: "neutral",
};

interface Props {
  paperId: number;
  schemes: SchemeSummary[];
  onChanged: () => void;
}

/** Every marking scheme version of a paper, with its full lifecycle history and the
 * actions available from wherever it currently stands. */
export function SchemePanel({ paperId, schemes, onChanged }: Props) {
  return (
    <Card>
      <SectionHeading hint={`${schemes.length} version(s)`}>Marking schemes</SectionHeading>
      {schemes.length === 0 ? (
        <div>
          <p className="text-sm text-slate-500">No marking scheme has been created yet.</p>
          <Link
            to={`/admin/import?paperId=${paperId}`}
            className="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline"
          >
            Import a marking scheme for this paper &rarr;
          </Link>
        </div>
      ) : (
        <ol className="space-y-4">
          {schemes.map((scheme) => (
            <li key={scheme.id}>
              <SchemeRow paperId={paperId} scheme={scheme} onChanged={onChanged} />
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function SchemeRow({
  paperId,
  scheme,
  onChanged,
}: {
  paperId: number;
  scheme: SchemeSummary;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approver, setApprover] = useState(readAdminRef());
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const editable =
    scheme.status === "draft" || scheme.status === "validated" || scheme.status === "validation_failed";

  async function run(name: string, action: () => Promise<unknown>) {
    setBusy(name);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-slate-700">v{scheme.version}</span>
        <Badge>{scheme.source}</Badge>
        <Badge tone={STATUS_TONE[scheme.status]}>{scheme.status.replace("_", " ")}</Badge>
      </div>

      <dl className="mt-3 space-y-1 text-xs text-slate-500">
        <div>Created {when(scheme.created_at)}</div>
        {scheme.validated_at && (
          <div>
            Validated {when(scheme.validated_at)}
            {scheme.checked_by && ` - checks: ${scheme.checked_by}`}
          </div>
        )}
        {scheme.approved_by && (
          <div>
            Approved by <strong className="text-slate-700">{scheme.approved_by}</strong>{" "}
            {scheme.approved_at && when(scheme.approved_at)}
          </div>
        )}
        {scheme.published_at && <div>Published {when(scheme.published_at)}</div>}
      </dl>

      {error && (
        <div className="mt-3">
          <ErrorBox message={error} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(scheme.status === "draft" || scheme.status === "validation_failed") && (
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void run("validate", () => validateScheme(paperId, scheme.version))}
          >
            {busy === "validate" ? "Checking..." : "Validate"}
          </Button>
        )}

        {scheme.status === "validated" && (
          <>
            <input
              value={approver}
              onChange={(event) => setApprover(event.target.value)}
              placeholder="Your name"
              aria-label="Approved by"
              className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
            />
            <Button
              variant="secondary"
              disabled={busy !== null || !approver.trim()}
              onClick={() =>
                void run("approve", () => {
                  saveAdminRef(approver.trim());
                  return approveScheme(paperId, scheme.version, approver.trim());
                })
              }
            >
              {busy === "approve" ? "Approving..." : "Approve"}
            </Button>
          </>
        )}

        {(scheme.status === "validated" ||
          scheme.status === "approved" ||
          scheme.status === "draft") && (
          <Button
            disabled={busy !== null}
            onClick={() => void run("publish", () => publishScheme(paperId, scheme.version))}
          >
            {busy === "publish" ? "Publishing..." : "Publish"}
          </Button>
        )}

        {scheme.status === "published" && (
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void run("retire", () => retireScheme(paperId, scheme.version))}
          >
            {busy === "retire" ? "Retiring..." : "Retire"}
          </Button>
        )}

        <Button
          variant="ghost"
          disabled={busy !== null}
          onClick={() => void run("copy", () => copyScheme(paperId, scheme.version))}
        >
          {busy === "copy" ? "Copying..." : "Copy to a new draft version"}
        </Button>

        {editable &&
          (confirmingDelete ? (
            <>
              <span className="text-xs text-rose-700">Delete this version?</span>
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void run("delete", () => deleteScheme(paperId, scheme.version))}
              >
                {busy === "delete" ? "Deleting..." : "Confirm"}
              </Button>
              <Button variant="ghost" disabled={busy !== null} onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="ghost" disabled={busy !== null} onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
          ))}
      </div>
    </div>
  );
}
