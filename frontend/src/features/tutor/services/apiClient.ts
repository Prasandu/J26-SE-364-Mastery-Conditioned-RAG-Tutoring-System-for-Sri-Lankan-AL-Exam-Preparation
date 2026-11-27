import { readAccessToken } from "@/auth/supabase";

/**
 * fetch wrapper that attaches the shared Supabase session's access token as a
 * Bearer Authorization header. Used by every API call that carries a student_id,
 * since the support service verifies the caller matches it (app.auth.require_self)
 * instead of trusting the client's value.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await readAccessToken();

  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(url, { ...options, headers });
}
