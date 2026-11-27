import type { Session, User } from "@supabase/supabase-js";

import { useAuth as useSupabaseSession } from "@/auth/AuthContext";

/**
 * The tutor pages' view of who is signed in. The integrated app has one sign-in
 * for all four components (Supabase Auth, src/auth/AuthProvider.tsx); this keeps
 * the shape the tutor pages were written against.
 */
interface TutorAuth {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

export function useAuth(): TutorAuth {
  const { session, loading, signOut } = useSupabaseSession();
  return { user: session?.user ?? null, session, loading, signOut };
}
