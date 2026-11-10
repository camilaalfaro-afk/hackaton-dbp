/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_WS_BASE_URL?: string
  readonly VITE_SUPABASE_URL?: string
  /** Publishable (anon) key only. Never the secret or service_role key. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Short SHA of the deployed commit, injected by Vite at build time. "dev" locally. */
declare const __BUILD_SHA__: string
