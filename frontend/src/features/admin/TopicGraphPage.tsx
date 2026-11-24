import { useCallback, useState } from "react";

import {
  decideTopicEdge,
  decideTopicEdges,
  deriveTopicEdges,
  listTopicEdges,
} from "@/api/admin";
import { ApiError } from "@/api/client";
import type { EdgeStatus, TopicEdge } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, SectionHeading } from "@/components/Card";
import { EmptyState, ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { useApi } from "@/hooks/useApi";
import { readAdminRef, saveAdminRef } from "@/lib/teacher";

const KIND_LABELS: Record<string, string> = {
  requires: "needs first",
  related_to: "related to",
  confused_with: "confused with",
};

const TABS: { status: EdgeStatus; label: string }[] = [
  { status: "proposed", label: "Waiting" },
  { status: "approved", label: "Approved" },
  { status: "rejected", label: "Rejected" },
];

/**
 * The syllabus graph, waiting for a teacher.
 *
 * Edges are derived from the syllabus text, never from question tags - a question
 * here carries one topic, so questions almost never show two together. Nothing is
 * used for retrieval until it is approved, the same rule as topic tags and marking.
 */
export function TopicGraphPage() {
  const [tab, setTab] = useState<EdgeStatus>("proposed");
  const load = useCallback((signal: AbortSignal) => listTopicEdges(tab, signal), [tab]);
  const { data: edges, error, loading, reload } = useApi(load, [tab]);

  const [deciding, setDeciding] = useState<number | null>(null);
  const [deriving, setDeriving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [decidedBy, setDecidedBy] = useState(readAdminRef());
  // Bulk approval covers what is on screen, so the filter is what makes it a
  // decision about a set rather than a blanket one.
  const [minWeight, setMinWeight] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [bulking, setBulking] = useState(false);

  async function runDerivation() {
    setDeriving(true);
    setActionError(null);
    setNote(null);
    try {
      const found = await deriveTopicEdges();
      setNote(
        found.proposed === 0
          ? `Nothing new: all ${found.already_known} edges the syllabus suggests are already here.`
          : `${found.proposed} new edge(s) proposed for review.`,
      );
      reload();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setDeriving(false);
    }
  }

  async function decide(edge: TopicEdge, approved: boolean) {
    const who = decidedBy.trim();
    if (!who) {
      setActionError("Put your name or email in first - every decision is recorded against it.");
      return;
    }
    setDeciding(edge.id);
    setActionError(null);
    try {
      saveAdminRef(who);
      await decideTopicEdge(edge.id, approved, who);
      reload();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setDeciding(null);
    }
  }

  const shown = (edges ?? []).filter((edge) => edge.weight * 100 >= minWeight);
  const pending = shown.filter((edge) => edge.status === "proposed");

  async function decideShown(approved: boolean) {
    const who = decidedBy.trim();
    if (!who) {
      setActionError("Put your name or email in first - every decision is recorded against it.");
      return;
    }
    setBulking(true);
    setActionError(null);
    try {
      saveAdminRef(who);
      const result = await decideTopicEdges(pending.map((edge) => edge.id), approved, who);
      setNote(`${result.decided} edge(s) ${approved ? "approved" : "rejected"}.`);
      setConfirming(false);
      reload();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBulking(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <SectionHeading>Syllabus graph</SectionHeading>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Which topics a topic needs first, and which belong together. Approved edges are
              used to retrieve the right material when a practice paper is written, and to tell a
              student which weak topic is holding others back. Nothing is used until you approve it.
            </p>
          </div>
          <Button onClick={() => void runDerivation()} disabled={deriving} variant="secondary">
            {deriving ? "Reading the syllabus..." : "Propose edges from the syllabus"}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="decided-by" className="text-sm text-slate-600">
            Decided by
          </label>
          <input
            id="decided-by"
            value={decidedBy}
            onChange={(event) => setDecidedBy(event.target.value)}
            placeholder="your name or email"
            className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>

        {note && <p className="mt-3 text-sm text-emerald-800">{note}</p>}
        {actionError && <div className="mt-3"><ErrorBox message={actionError} /></div>}
      </Card>

      {tab === "proposed" && (
        <Card>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <label htmlFor="min-weight" className="text-sm text-slate-600">
              Show edges at least
            </label>
            <input
              id="min-weight"
              type="range"
              min={0}
              max={100}
              step={5}
              value={minWeight}
              onChange={(event) => {
                setMinWeight(Number(event.target.value));
                setConfirming(false);
              }}
              className="w-48"
            />
            <span className="w-28 text-sm font-medium tabular-nums text-slate-700">
              {minWeight}% strong
            </span>

            <span className="ml-auto flex flex-wrap items-center gap-2">
              {confirming ? (
                <>
                  <span className="text-sm text-slate-700">
                    Approve all {pending.length} shown?
                  </span>
                  <Button disabled={bulking} onClick={() => void decideShown(true)}>
                    {bulking ? "Saving..." : "Yes, approve them"}
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  disabled={pending.length === 0}
                  onClick={() => setConfirming(true)}
                >
                  Approve all {pending.length} shown
                </Button>
              )}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            This decides only the edges listed below, and records them against your name. Raise
            the threshold to review the strongest first.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((option) => (
          <button
            key={option.status}
            type="button"
            onClick={() => setTab(option.status)}
            className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${
              tab === option.status
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && <ErrorBox message={error} />}
      {loading && <Spinner label="Loading the graph..." />}

      {!loading && edges && shown.length === 0 && (
        <EmptyState title={tab === "proposed" ? "Nothing waiting" : `No ${tab} edges yet`}>
          {tab === "proposed"
            ? 'Press "Propose edges from the syllabus" to look for more.'
            : "Edges you decide on show up here."}
        </EmptyState>
      )}

      {!loading && edges && shown.length > 0 && (
        <Card>
          <ul className="divide-y divide-slate-100">
            {shown.map((edge) => (
              <li key={edge.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <span className="font-mono text-sm font-medium text-slate-800">{edge.from_code}</span>
                <Badge tone={edge.kind === "requires" ? "warn" : "neutral"}>
                  {KIND_LABELS[edge.kind] ?? edge.kind}
                </Badge>
                <span className="font-mono text-sm font-medium text-slate-800">{edge.to_code}</span>

                <span className="text-xs tabular-nums text-slate-400">
                  {Math.round(edge.weight * 100)}%
                </span>
                {edge.evidence && (
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-500" title={edge.evidence}>
                    {edge.evidence}
                  </span>
                )}
                {edge.source === "teacher" && <Badge>written by a teacher</Badge>}

                {edge.status === "proposed" ? (
                  <span className="ml-auto flex gap-2">
                    <Button disabled={deciding === edge.id} onClick={() => void decide(edge, true)}>
                      {deciding === edge.id ? "Saving..." : "Approve"}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={deciding === edge.id}
                      onClick={() => void decide(edge, false)}
                    >
                      Reject
                    </Button>
                  </span>
                ) : (
                  <span className="ml-auto text-xs text-slate-400">
                    {edge.status} {edge.decided_by ? `by ${edge.decided_by}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
