import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AppNav } from '../components/AppNav'
import { api } from '../lib/api'
import { ApiError } from '../lib/http'
import { withRetry } from '../lib/retry'
import type { FilePage } from '../types/api'

const SIZES = [10, 25, 50]
const STATUSES = ['ACTIVE', 'COMPLETE']
const SORTS = ['updatedAt,desc', 'name,asc', 'progress,desc']
const SORT_LABELS: Record<string, string> = {
  'updatedAt,desc': 'Más recientes',
  'name,asc': 'Nombre',
  'progress,desc': 'Mayor progreso',
}
const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Activo', COMPLETE: 'Completo' }

interface Query {
  page: number
  size: number
  status: string
  q: string
  sort: string
}

/** The URL is the state. Anything invalid in it falls back to the default. */
function readQuery(params: URLSearchParams): Query {
  const page = Number(params.get('page'))
  const size = Number(params.get('size'))
  const status = params.get('status') ?? ''
  const sort = params.get('sort') ?? ''
  return {
    page: Number.isInteger(page) && page >= 0 ? page : 0,
    size: SIZES.includes(size) ? size : 10,
    status: STATUSES.includes(status) ? status : '',
    q: (params.get('q') ?? '').slice(0, 60),
    sort: SORTS.includes(sort) ? sort : SORTS[0],
  }
}

function toSearch(query: Query): string {
  const params = new URLSearchParams()
  if (query.page > 0) params.set('page', String(query.page))
  if (query.size !== 10) params.set('size', String(query.size))
  if (query.status) params.set('status', query.status)
  if (query.q) params.set('q', query.q)
  if (query.sort !== SORTS[0]) params.set('sort', query.sort)
  return params.toString()
}

interface Result {
  key: string
  data: FilePage | null
  error: string | null
}

export function FilesPage() {
  const [params, setParams] = useSearchParams()
  const query = readQuery(params)
  const key = toSearch(query)
  const [reload, setReload] = useState(0)
  const [result, setResult] = useState<Result | null>(null)

  // The search box keeps its own text and follows the URL when it changes (back, forward).
  const [draft, setDraft] = useState(query.q)
  const [syncedQ, setSyncedQ] = useState(query.q)
  if (syncedQ !== query.q) {
    setSyncedQ(query.q)
    setDraft(query.q)
  }

  function update(changes: Partial<Query>, replace = false) {
    setParams(toSearch({ ...query, page: 0, ...changes }), { replace })
  }

  // One request after the typing stops, not one per key.
  useEffect(() => {
    if (draft === query.q) return
    const timer = setTimeout(() => {
      setParams(toSearch({ ...readQuery(params), page: 0, q: draft.slice(0, 60) }), { replace: true })
    }, 350)
    return () => clearTimeout(timer)
  }, [draft, query.q, params, setParams])

  // Each change cancels the previous request, so an old answer never replaces a new one.
  useEffect(() => {
    const controller = new AbortController()
    withRetry((signal) => api<FilePage>(`/files${key ? `?${key}` : ''}`, { signal }), controller.signal).then(
      (data) => setResult({ key, data, error: null }),
      (error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof ApiError ? error.message : 'No se pudieron cargar los archivos.'
        setResult({ key, data: null, error: message })
      },
    )
    return () => controller.abort()
  }, [key, reload])

  const loading = result?.key !== key
  const page = result?.data ?? null
  const lastPage = page ? Math.max(0, page.totalPages - 1) : 0

  return (
    <>
      <AppNav />
      <main className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-8">
        <h1 className="text-2xl font-semibold">Archivos de datos</h1>

        <form className="flex flex-wrap items-end gap-3" role="search" onSubmit={(event) => event.preventDefault()}>
          <label className="grid gap-1">
            <span>Buscar</span>
            <input
              type="search"
              value={draft}
              maxLength={60}
              onChange={(event) => setDraft(event.target.value)}
              className="rounded border border-slate-600 bg-slate-900 px-3 py-2"
            />
          </label>
          <label className="grid gap-1">
            <span>Estado</span>
            <select
              value={query.status}
              onChange={(event) => update({ status: event.target.value })}
              className="rounded border border-slate-600 bg-slate-900 px-3 py-2"
            >
              <option value="">Todos</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span>Orden</span>
            <select
              value={query.sort}
              onChange={(event) => update({ sort: event.target.value })}
              className="rounded border border-slate-600 bg-slate-900 px-3 py-2"
            >
              {SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {SORT_LABELS[sort]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span>Por página</span>
            <select
              value={query.size}
              onChange={(event) => update({ size: Number(event.target.value) })}
              className="rounded border border-slate-600 bg-slate-900 px-3 py-2"
            >
              {SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </form>

        <p role="status" aria-live="polite" className="min-h-6 text-sm text-slate-300">
          {loading ? 'Cargando…' : page ? `${page.totalElements} archivos` : ''}
        </p>

        {!loading && result?.error && (
          <p role="alert" className="text-red-300">
            {result.error}{' '}
            <button type="button" className="underline" onClick={() => setReload((current) => current + 1)}>
              Reintentar
            </button>
          </p>
        )}

        {page && page.content.length === 0 && !loading && (
          <p>
            No hay archivos con estos filtros.{' '}
            {query.page > 0 && (
              <button type="button" className="underline" onClick={() => update({ page: lastPage })}>
                Ir a la última página
              </button>
            )}
          </p>
        )}

        {page && page.content.length > 0 && (
          <table className={`w-full text-left ${loading ? 'opacity-60' : ''}`}>
            <thead>
              <tr className="border-b border-slate-700">
                <th scope="col" className="py-2">
                  Archivo
                </th>
                <th scope="col">Estado</th>
                <th scope="col">Progreso</th>
                <th scope="col">Grupos</th>
                <th scope="col">Errores</th>
              </tr>
            </thead>
            <tbody>
              {page.content.map((file) => (
                <tr key={file.id} className="border-b border-slate-800">
                  <th scope="row" className="py-2 font-normal">
                    <Link to={`/files/${file.id}/refine`} className="underline">
                      {file.name}
                    </Link>
                  </th>
                  <td>{STATUS_LABELS[file.status] ?? file.status}</td>
                  <td>
                    <progress max={1} value={file.progress.overall} aria-label={`Progreso de ${file.name}`} />{' '}
                    {Math.round(file.progress.overall * 100)} %
                  </td>
                  <td>
                    {file.refinedGroups} / {file.totalGroups}
                  </td>
                  <td>{file.mistakes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {page && (
          <nav aria-label="Paginación" className="flex items-center gap-4">
            <button
              type="button"
              className="underline disabled:opacity-40"
              disabled={query.page <= 0}
              onClick={() => update({ page: query.page - 1 })}
            >
              Anterior
            </button>
            <span>
              Página {query.page + 1} de {Math.max(1, page.totalPages)}
            </span>
            <button
              type="button"
              className="underline disabled:opacity-40"
              disabled={query.page >= lastPage}
              onClick={() => update({ page: query.page + 1 })}
            >
              Siguiente
            </button>
          </nav>
        )}
      </main>
    </>
  )
}


