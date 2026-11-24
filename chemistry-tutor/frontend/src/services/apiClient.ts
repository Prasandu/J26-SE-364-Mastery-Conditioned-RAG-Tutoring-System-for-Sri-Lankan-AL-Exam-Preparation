import { supabase } from "../lib/supabaseClient";

/**
 * fetch wrapper that attaches the current Supabase session's access token
 * as a Bearer Authorization header. Used by every API call that carries a
 * student_id, since the backend now verifies the caller matches it
 * (app.auth.require_self) instead of trusting the client's value.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(url, { ...options, headers });
}
