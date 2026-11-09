function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.`)
  }
  return value.replace(/\/+$/, '')
}

/** Every setting comes from the environment. Nothing is hardcoded in components. */
export const config = {
  apiBaseUrl: required('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL),
  wsBaseUrl: required('VITE_WS_BASE_URL', import.meta.env.VITE_WS_BASE_URL),
  buildSha: __BUILD_SHA__,
} as const
