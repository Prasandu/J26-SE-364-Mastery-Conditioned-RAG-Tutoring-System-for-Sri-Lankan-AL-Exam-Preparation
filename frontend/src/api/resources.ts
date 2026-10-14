// Resource books (RAG): upload, embed, publish, search. Admin only.

import { request } from "./client";
import type { EmbedResult, IngestResult, ResourceSummary } from "./types";

export function listResources(signal?: AbortSignal): Promise<ResourceSummary[]> {
  return request<ResourceSummary[]>("/admin/resources", { signal });
}

export interface UploadResourceInput {
  code: string;
  title: string;
  subject: string;
  topicCode?: string;
  file: File;
  createdBy: string;
}

export function uploadResource(input: UploadResourceInput): Promise<IngestResult> {
  const form = new FormData();
  form.append("code", input.code);
  form.append("title", input.title);
  form.append("subject", input.subject);
  if (input.topicCode) {
    form.append("topic_code", input.topicCode);
  }
  form.append("created_by", input.createdBy);
  form.append("file", input.file);
  return request<IngestResult>("/admin/resources", { method: "POST", form });
}

export function embedResource(code: string, version: number): Promise<EmbedResult> {
  return request<EmbedResult>(`/admin/resources/${code}/${version}/embed`, {
    method: "POST" });
}

export function publishResource(code: string, version: number): Promise<ResourceSummary> {
  return request<ResourceSummary>(`/admin/resources/${code}/${version}/publish`, {
    method: "POST" });
}
