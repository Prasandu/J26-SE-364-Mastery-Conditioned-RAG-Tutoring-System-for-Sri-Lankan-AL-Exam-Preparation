import { readAdminKey } from "@/lib/teacher";

import { request } from "./client";
import type { Counts, GeneratedPaper, PaperDetail, Rates, Shape, Topic } from "./types";

// Every admin endpoint needs the admin key.
function headers(): Record<string, string> {
  return { "X-Admin-Key": readAdminKey() };
}

export function listTopics(signal?: AbortSignal): Promise<Topic[]> {
  return request<Topic[]>("/admin/topics", { headers: headers(), signal });
}

export function generatorRates(signal?: AbortSignal): Promise<Rates> {
  return request<Rates>("/admin/model-papers/rates", { headers: headers(), signal });
}

interface GenerateBody {
  title: string;
  topic_codes: string[];
  counts: Counts;
}

export function planPaper(body: GenerateBody, signal?: AbortSignal): Promise<Shape> {
  return request<Shape>("/admin/model-papers/plan", {
    method: "POST",
    body,
    headers: headers(),
    signal,
  });
}

export function generatePaper(body: GenerateBody): Promise<GeneratedPaper> {
  return request<GeneratedPaper>("/admin/model-papers", {
    method: "POST",
    body,
    headers: headers(),
  });
}

export function adminPaper(paperId: number, signal?: AbortSignal): Promise<PaperDetail> {
  return request<PaperDetail>(`/admin/papers/${paperId}`, { headers: headers(), signal });
}

export function publishScheme(paperId: number, version: number): Promise<unknown> {
  return request(`/admin/papers/${paperId}/marking-schemes/${version}/publish`, {
    method: "POST",
    headers: headers(),
  });
}

export function publishPaper(paperId: number): Promise<unknown> {
  return request(`/admin/papers/${paperId}/publish`, { method: "POST", headers: headers() });
}
