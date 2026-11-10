import { useEffect, useState } from 'react'
import { AppNav } from '../components/AppNav'
import { api } from '../lib/api'
import { config } from '../lib/config'
import { ApiError } from '../lib/http'
import { withRetry } from '../lib/retry'
import type { Check, ClearanceCheckResult, Health, IntegrationStatus } from '../types/api'

type ApiHealth = 'checking' | 'ok' | 'down'

function CheckList({ checks }: { checks: Check[] }) {
  if (checks.length === 0) return <p>Sin comprobaciones todavía.</p>
  return (
    <ul className="grid gap-1">
      {checks.map((check) => (
        <li key={check.name}>
          <strong>{check.passed ? 'Aprobada' : 'Pendiente'}</strong> · {check.name}: {check.detail}
        </li>
      ))}
    </ul>
  )
}

export function StatusPage() {
  const [reload, setReload] = useState(0)
  const [health, setHealth] = useState<ApiHealth>('checking')
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<ClearanceCheckResult | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    api<Health>('/meta/health', { auth: false, signal }).then(
      () => setHealth('ok'),
      () => {
        if (!signal.aborted) setHealth('down')
      },
    )
    withRetry((s) => api<IntegrationStatus>('/integrations/status', { signal: s }), signal).then(
      (data) => {
        setStatus(data)
        setLoadError(null)
      },
      (error: unknown) => {
        if (!signal.aborted) setLoadError(error instanceof ApiError ? error.message : 'No se pudo cargar el estado.')
      },
    )

    return () => controller.abort()
  }, [reload])

  async function runCheck() {
    if (checking) return
    setChecking(true)
    setCheckError(null)
    try {
      setResult(await api<ClearanceCheckResult>('/clearance/check', { method: 'POST' }))
      setReload((current) => current + 1)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CHECK_FROM_APP_REQUIRED') {
        setCheckError('La revisión solo cuenta desde la app desplegada en el dominio verificado.')
      } else {
        setCheckError(error instanceof ApiError ? error.message : 'No se pudo correr la revisión.')
      }
    } finally {
      setChecking(false)
    }
  }

  const clearance = result ?? status?.clearance ?? null

  return (
    <>
      <AppNav />
      <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8">
        <h1 className="text-2xl font-semibold">Estado</h1>

        <section aria-labelledby="build-title" className="grid gap-1">
          <h2 id="build-title" className="text-lg font-semibold">
            Despliegue
          </h2>
          <p>
            Build desplegado: <code>{config.buildSha}</code>
          </p>
          <p role="status">
            API: {health === 'checking' ? 'comprobando…' : health === 'ok' ? 'responde' : 'no responde'}
          </p>
          {status && (
            <>
              <p>Dominio verificado: {status.deploy.verifiedAt ? status.deploy.origin : 'no'}</p>
              <p>Último build visto por Lumon: {status.deploy.lastBuildSeen ?? 'ninguno'}</p>
            </>
          )}
        </section>

        <section aria-labelledby="storage-title" className="grid gap-1">
          <h2 id="storage-title" className="text-lg font-semibold">
            Storage
          </h2>
          {status ? (
            <>
              <p>
                {status.storage.provider ?? 'Sin configurar'} ·{' '}
                {status.storage.verifiedAt ? 'verificado' : 'sin verificar'}
              </p>
              <CheckList checks={status.storage.checks} />
            </>
          ) : (
            <p>{loadError ?? 'Cargando…'}</p>
          )}
        </section>

        <section aria-labelledby="clearance-title" className="grid gap-2">
          <h2 id="clearance-title" className="text-lg font-semibold">
            Piso de Pruebas
          </h2>
          <p role="status">{clearance ? (clearance.granted ? 'Abierto' : 'Cerrado') : 'Cargando…'}</p>
          {result && <CheckList checks={result.checks} />}
          {checkError && (
            <p role="alert" className="text-red-300">
              {checkError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={checking}
            className="justify-self-start rounded bg-sky-600 px-3 py-2 font-medium text-white disabled:opacity-60"
          >
            {checking ? 'Revisando…' : 'Abrir el Piso de Pruebas'}
          </button>
        </section>

        {loadError && (
          <p role="alert" className="text-red-300">
            {loadError}{' '}
            <button type="button" className="underline" onClick={() => setReload((current) => current + 1)}>
              Reintentar
            </button>
          </p>
        )}
      </main>
    </>
  )
}
