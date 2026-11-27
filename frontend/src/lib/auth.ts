// The session itself is kept by Supabase Auth (src/auth/supabase.ts), shared by all
// four components; this only remembers that a sign-out just happened.

// Set for one render when logout() runs, so RequireAuth can tell "signed out of
// this page just now" apart from "never signed in, landed here directly" - the
// former must never carry a ?next= back into the login page, whatever role signs
// in next; the latter should. In-memory only (not storage): it only needs to
// survive the handful of renders right after sign-out, in this same tab.
let justSignedOut = false;

export function markSignedOut(): void {
  justSignedOut = true;
}

/** True once, then resets - call this exactly where the redirect decision is made. */
export function consumeSignedOut(): boolean {
  const was = justSignedOut;
  justSignedOut = false;
  return was;
}
