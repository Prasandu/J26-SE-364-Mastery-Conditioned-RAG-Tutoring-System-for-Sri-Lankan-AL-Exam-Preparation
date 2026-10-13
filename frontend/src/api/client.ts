// The only place that calls fetch. Everything else goes through request().

const BASE_URL = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "");

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

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      signal,
      // Never set Content-Type for FormData: the browser adds the multipart boundary.
      headers: body ? { "Content-Type": "application/json", ...headers } : headers,
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
  } catch (cause) {
    // fetch only rejects when the server could not be reached at all.
    throw new ApiError(0, `Cannot reach the assessment service at ${BASE_URL}`, [String(cause)]);
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
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
    response = await fetch(`${BASE_URL}${path}`, { signal, headers });
  } catch (cause) {
    throw new ApiError(0, `Cannot reach the assessment service at ${BASE_URL}`, [String(cause)]);
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }
  return response.blob();
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") {
      return body.detail;
    }
  } catch {
    // The body was not JSON; fall back to the status line.
  }
  return `${response.status} ${response.statusText}`;
}

export const apiBaseUrl = BASE_URL;
