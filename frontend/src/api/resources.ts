// Resource books (RAG): upload, embed + publish, search. Admin only.

import { request } from "./client";
import type { IngestResult, PublishResult, ResourceSummary } from "./types";

export function listResources(signal?: AbortSignal): Promise<ResourceSummary[]> {
  return request<ResourceSummary[]>("/admin/resources", { signal });
}

export interface UploadResourceInput {
  code: string;
  title: string;
  subject: string;
  topicCode?: string;
  file: File;
}

// created_by is not sent - the backend fills it in from the signed-in admin account
// (see app/api/resources.py), the same way student_ref works for an attempt.
export function uploadResource(input: UploadResourceInput): Promise<IngestResult> {
  const form = new FormData();
  form.append("code", input.code);
  form.append("title", input.title);
  form.append("subject", input.subject);
  if (input.topicCode) {
    form.append("topic_code", input.topicCode);
  }
  form.append("file", input.file);
  return request<IngestResult>("/admin/resources", { method: "POST", form });
}

// One admin action: embed whatever still needs it, then publish. Refuses (and
// leaves the version as a draft) if any chunk could not be embedded - see
// app/services/resources/ingest.py's embed_and_publish.
export function publishResource(code: string, version: number): Promise<PublishResult> {
  return request<PublishResult>(`/admin/resources/${code}/${version}/embed-and-publish`, {
    method: "POST",
  });
}
