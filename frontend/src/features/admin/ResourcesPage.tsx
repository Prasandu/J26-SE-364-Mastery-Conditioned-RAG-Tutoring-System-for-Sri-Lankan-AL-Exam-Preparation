import { useState } from "react";

import { embedResource, listResources, publishResource, uploadResource } from "@/api/resources";
import { ApiError } from "@/api/client";
import type { IngestResult, ResourceStatus, ResourceSummary } from "@/api/types";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, SectionHeading } from "@/components/Card";
import { ErrorBox } from "@/components/ErrorBox";
import { Spinner } from "@/components/Spinner";
import { useApi } from "@/hooks/useApi";
import { readAdminRef, saveAdminRef } from "@/lib/teacher";

const STATUS_TONE: Record<ResourceStatus, BadgeTone> = {
  draft: "neutral",
  published: "good",
  retired: "neutral",
};

/** Upload a trusted Chemistry resource book, embed it, and publish it for question
 * generation to ground itself in (see docs/rag-resources.md). */
export function ResourcesPage() {
  const resources = useApi(listResources, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Resource books</h1>
        <p className="mt-1 text-sm text-slate-500">
          Reference material question generation can ground itself in - not past papers or marking
          schemes, those are entered directly (see Import a PDF).
        </p>
      </div>

      <UploadCard onUploaded={resources.reload} />

      <Card>
        <SectionHeading hint={resources.data ? `${resources.data.length}` : undefined}>
          Every version
        </SectionHeading>

        {resources.loading && <Spinner label="Loading resources..." />}
        {resources.error && <ErrorBox message={resources.error} />}
        {resources.data?.length === 0 && (
          <p className="text-sm text-slate-500">No resource books uploaded yet.</p>
        )}
        {resources.data && resources.data.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {resources.data.map((resource) => (
              <li key={resource.id} className="py-3">
                <ResourceRow resource={resource} onChanged={resources.reload} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function UploadCard({ onUploaded }: { readonly onUploaded: () => void }) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [topicCode, setTopicCode] = useState("");
  const [createdBy, setCreatedBy] = useState(readAdminRef);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setProblem("Choose a PDF first");
      return;
    }
    setBusy(true);
    setProblem(null);
    setResult(null);
    const by = createdBy.trim();
    saveAdminRef(by);
    try {
      const outcome = await uploadResource({
        code: code.trim(),
        title: title.trim(),
        subject: "chemistry",
        topicCode: topicCode.trim() || undefined,
        file,
        createdBy: by,
      });
      setResult(outcome);
      onUploaded();
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionHeading>Upload a new resource book</SectionHeading>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field id="resource-code" label="Code" hint="e.g. chem-11-resource-book">
          <input
            id="resource-code"
            required
            pattern="^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </Field>

        <Field id="resource-title" label="Title">
          <input
            id="resource-title"
            required
            maxLength={300}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </Field>

        <Field id="resource-topic" label="Topic code (optional)" hint="e.g. U13">
          <input
            id="resource-topic"
            maxLength={30}
            value={topicCode}
            onChange={(event) => setTopicCode(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </Field>

        <Field id="resource-by" label="Your name">
          <input
            id="resource-by"
            required
            maxLength={64}
            value={createdBy}
            onChange={(event) => setCreatedBy(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </Field>

        <div className="sm:col-span-2 space-y-1">
          <label htmlFor="resource-file" className="block text-sm text-slate-600">
            PDF
          </label>
          <input
            id="resource-file"
            type="file"
            accept="application/pdf"
            required
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
        </div>

        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </form>

      {problem && (
        <div className="mt-3">
          <ErrorBox message={problem} />
        </div>
      )}

      {result && (
        <p className="mt-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-800">
          {result.created
            ? `Ingested: ${result.chunks_created} chunk(s) created.`
            : "This file matches what is already stored - nothing changed."}
          {result.thin_pages.length > 0 &&
            ` ${result.thin_pages.length} page(s) had very little extractable text - check those.`}
        </p>
      )}
    </Card>
  );
}

function ResourceRow({
  resource,
  onChanged,
}: {
  readonly resource: ResourceSummary;
  readonly onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [embedded, setEmbedded] = useState<string | null>(null);

  async function embed() {
    setBusy(true);
    setProblem(null);
    setEmbedded(null);
    try {
      const result = await embedResource(resource.code, resource.version);
      setEmbedded(
        result.still_pending > 0
          ? `Embedded ${result.embedded}, ${result.still_pending} left - run Embed again.`
          : `Embedded ${result.embedded}. Ready to publish.`,
      );
      onChanged();
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setProblem(null);
    try {
      await publishResource(resource.code, resource.version);
      onChanged();
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-medium text-slate-800">
          {resource.title} <span className="font-mono text-xs text-slate-400">v{resource.version}</span>
        </p>
        <p className="text-xs text-slate-500">
          {resource.code} - {resource.page_count} pages
          {resource.topic_code && ` - ${resource.topic_code}`} - by {resource.created_by}
        </p>
        {problem && <p className="mt-1 text-xs text-rose-700">{problem}</p>}
        {embedded && <p className="mt-1 text-xs text-brand-700">{embedded}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={STATUS_TONE[resource.status]}>{resource.status}</Badge>
        {resource.status === "draft" && (
          <>
            <Button variant="secondary" disabled={busy} onClick={() => void embed()}>
              Embed
            </Button>
            <Button disabled={busy} onClick={() => void publish()}>
              Publish
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm text-slate-600">
        {label}
        {hint && <span className="ml-1.5 text-xs text-slate-400">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
