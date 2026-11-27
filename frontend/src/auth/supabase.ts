import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (client) {
    return client;
  }

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }

  client = createClient(url, anonKey);
  return client;
}

export async function getAccessToken(): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) {
    throw new Error(`Could not read the Supabase session: ${error.message}`);
  }
  if (!data.session?.access_token) {
    throw new Error("Sign in to use planning.");
  }
  return data.session.access_token;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

/** The signed-in user's access token, or "" when nobody is signed in (or Supabase
 * is not configured) - for requests that also work anonymously. */
export async function readAccessToken(): Promise<string> {
  if (!isSupabaseConfigured()) {
    return "";
  }
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session?.access_token ?? "";
  } catch {
    return "";
  }
}
