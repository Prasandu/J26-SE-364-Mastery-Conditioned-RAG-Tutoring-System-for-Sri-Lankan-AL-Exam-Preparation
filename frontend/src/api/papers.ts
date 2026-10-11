import { request } from "./client";

export function getPapers<T>() {
  return request<T[]>("/papers");
}

export function getPaper<T>(id: string) {
  return request<T>(`/papers/${encodeURIComponent(id)}`);
}
