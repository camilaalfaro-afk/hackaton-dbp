import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import { ApiError } from '../lib/http'
import { retryDelay } from '../lib/retry'
import type { Health } from '../types/api'

/** Holds the app back until the API answers, retrying on its own with growing waits. */
export function HealthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (ready) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    api<Health>('/meta/health', { auth: false, signal: controller.signal }).then(
      () => setReady(true),
      (error: unknown) => {
        if (controller.signal.aborted) return
        setFailed(true)
        const retryAfter = error instanceof ApiError ? error.retryAfter : null
        timer = setTimeout(() => setAttempt((current) => current + 1), retryDelay(attempt, retryAfter))
      },
    )

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [attempt, ready])

  if (ready) return children

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="grid gap-4 text-center" role="status" aria-live="polite">
        <h1 className="text-2xl font-semibold">Conectando con Lumon…</h1>
        {failed && (
          <>
            <p>La API no responde. Reintento automático número {attempt + 1}.</p>
            <button
              type="button"
              onClick={() => setAttempt((current) => current + 1)}
              className="justify-self-center rounded bg-sky-600 px-3 py-2 font-medium text-white"
            >
              Reintentar ahora
            </button>
          </>
        )}
      </div>
    </main>
  )
}
