import type { ReactNode } from 'react'

// TODO(C): call GET /meta/health with api('/meta/health', { auth: false }). While it fails,
// show "Conectando con Lumon…", retry with growing waits and offer a manual retry button.

export function HealthGate({ children }: { children: ReactNode }) {
  return children
}
