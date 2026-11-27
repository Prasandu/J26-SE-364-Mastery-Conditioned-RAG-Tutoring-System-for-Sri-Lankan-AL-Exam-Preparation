/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENGINE_ADAPTER?: 'local' | 'api';
  /** LAB-018: the platform's Supabase project (public URL and anon key only). */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
