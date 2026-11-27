/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Assessment service (component 2). */
  readonly VITE_API_URL?: string;
  /** Planning service (component 3). */
  readonly VITE_PLANNING_API_URL?: string;
  /** Support / AI tutor service (component 4). */
  readonly VITE_SUPPORT_API_URL?: string;
  /** The virtual lab web app (component 1, apps/web). */
  readonly VITE_LAB_URL?: string;
  /** The shared Supabase project: one sign-in for all four components. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
