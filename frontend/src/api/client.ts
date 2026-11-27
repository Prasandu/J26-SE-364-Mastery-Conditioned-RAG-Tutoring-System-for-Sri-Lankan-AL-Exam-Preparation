// The only place that calls fetch. Everything else goes through request() (the
// assessment service) or requestService() (the planning and support services).

import { readAccessToken } from "@/auth/supabase";

const BASE_URL = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "");

// The shared Supabase sign-in's access token, attached to every request when the
// caller is signed in - all four services accept it. A caller's own `headers` still
// wins if it sets Authorization itself.
async function withAuth(headers: Record<string, string>): Promise<Record<string, string>> {
  const token = await readAccessToken();
  return token ? { Authorization: `Bearer ${token}`, ...headers } : headers;
}

export class ApiError extends Error {
  status: number;
  details: string[];

  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: FormData; // an upload; the browser sets the content type itself
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, form, headers = {}, signal } = options;
  const withToken = await withAuth(headers);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      signal,
      // Never set Content-Type for FormData: the browser adds the multipart boundary.
      headers: body ? { "Content-Type": "application/json", ...withToken } : withToken,
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
  } catch (cause) {
    // fetch only rejects when the server could not be reached at all.
    throw new ApiError(0, `Cannot reach the assessment service at ${BASE_URL}`, [String(cause)]);
  }

  if (!response.ok) {
    const { message, details } = await readError(response);
    throw new ApiError(response.status, message, details);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/**
 * A file rather than JSON, e.g. a photo of an answer.
 *
 * Needed because the staff key travels in a header, so an <img src> cannot fetch
 * one: the caller turns this blob into an object URL instead.
 */
export async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const { headers = {}, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { signal, headers: await withAuth(headers) });
  } catch (cause) {
    throw new ApiError(0, `Cannot reach the assessment service at ${BASE_URL}`, [String(cause)]);
  }

  if (!response.ok) {
    const { message, details } = await readError(response);
    throw new ApiError(response.status, message, details);
  }
  return response.blob();
}

/** The message every error on this API uses, plus the itemized `errors` list a
 * ContentValidationError or a request-validation failure sends alongside it (see
 * app/main.py's exception handlers) - the specifics behind the one-line summary. */
async function readError(response: Response): Promise<{ message: string; details: string[] }> {
  try {
    const body = (await response.json()) as { detail?: unknown; errors?: unknown };
    const details = Array.isArray(body.errors) ? body.errors.filter((e) => typeof e === "string") : [];
    if (typeof body.detail === "string") {
      return { message: body.detail, details };
    }
  } catch {
    // The body was not JSON; fall back to the status line.
  }
  return { message: `${response.status} ${response.statusText}`, details: [] };
}

export const apiBaseUrl = BASE_URL;

/**
 * A JSON request to another component's service (planning, support), signed in
 * with the same Supabase access token. Errors arrive as ApiError, with the
 * service's own `detail` message, the same as request().
 */
export async function requestService<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  serviceName = "the service",
): Promise<T> {
  const root = baseUrl.replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${root}${path}`, {
      ...init,
      headers: await withAuth({ Accept: "application/json", ...(init.headers as Record<string, string>) }),
    });
  } catch (cause) {
    throw new ApiError(0, `Cannot reach ${serviceName} at ${root}`, [String(cause)]);
  }

  if (!response.ok) {
    const { message, details } = await readError(response);
    throw new ApiError(response.status, message, details);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
