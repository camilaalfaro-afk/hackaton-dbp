import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'
import { ApiError } from '../lib/http'
import { BinBars } from '../grid/BinBar'
import { ForbiddenPage } from './ForbiddenPage'
import type { DataFile } from '../types/api'

interface FilePage {
  content: DataFile[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}
interface Result {
  key: string
  data?: FilePage
  error?: unknown
}
const control = 'rounded border border-slate-500 bg-slate-900 px-3 py-2 focus-visible:outline-2 focus-visible:outline-sky-300'
const button = `${control} disabled:cursor-not-allowed disabled:opacity-50`
const sorts = ['updatedAt,desc', 'name,asc', 'progress,desc']

/** Normalize before making a request, including URLs typed by hand. */
function normalizedParams(input: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams()
  const rawPage = input.get('page') ?? '0'
  const page = /^\d+$/.test(rawPage) ? Number(rawPage) : 0
  out.set('page', String(Number.isSafeInteger(page) ? page : 0))
  const size = input.get('size') ?? '10'
  out.set('size', ['10', '25', '50'].includes(size) ? size : '10')
  const sort = input.get('sort') ?? ''
  out.set('sort', sorts.includes(sort) ? sort : sorts[0])
  const status = input.get('status')
  if (status === 'ACTIVE' || status === 'COMPLETE') out.set('status', status)
  const q = (input.get('q') ?? '').trim().slice(0, 60)
  if (q) out.set('q', q)
  return out
}

function Search({ q, onSearch }: { q: string; onSearch: (value: string) => void }) {
  const [draft, setDraft] = useState({ source: q, value: q })
  // Synchronize back/forward without remounting the input or losing keyboard focus.
  if (draft.source !== q) setDraft({ source: q, value: q })
  useEffect(() => {
    if (draft.value.trim() === q) return
    const timer = setTimeout(() => onSearch(draft.value.trim()), 400)
    return () => clearTimeout(timer)
  }, [draft.value, q, onSearch])
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draft.value.trim() !== q) onSearch(draft.value.trim())
  }
  return <form onSubmit={submit} role="search" className="grid gap-1">
    <label htmlFor="file-search">Buscar archivo</label>
    <div className="flex gap-2">
      <input id="file-search" name="q" type="search" maxLength={60} value={draft.value}
        onChange={event => setDraft({ source: q, value: event.target.value })} className={`${control} min-w-0 flex-1`} />
      <button type="submit" className={button}>Buscar</button>
    </div>
  </form>
}

export function FilesPage() {
  const { me, logout, can } = useAuth()
  const [params, setParams] = useSearchParams()
  const rawQuery = params.toString()
  const query = normalizedParams(params).toString()
  const current = new URLSearchParams(query)
  const page = Number(current.get('page'))
  const size = Number(current.get('size'))
  const q = current.get('q') ?? ''
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const permitted = can('files:read')
  const requestKey = `${query}|${retry}`

  useEffect(() => {
    if (rawQuery !== query) setParams(query, { replace: true })
  }, [rawQuery, query, setParams])

  function change(patch: Record<string, string>, replace = false) {
    const next = new URLSearchParams(query)
    for (const [name, value] of Object.entries(patch)) {
      if (value) next.set(name, value)
      else next.delete(name)
    }
    if (!('page' in patch)) next.set('page', '0')
    setParams(next, { replace })
  }
  const search = (value: string) => change({ q: value })

  useEffect(() => {
    if (!permitted) return
    const controller = new AbortController()
    let active = true
    api<FilePage>(`/files?${query}`, { signal: controller.signal }).then(
      data => {
        if (!active) return
        if (page > 0 && page >= data.totalPages) {
          const next = new URLSearchParams(query)
          next.set('page', String(Math.max(0, data.totalPages - 1)))
          setParams(next, { replace: true })
          return
        }
        setResult({ key: requestKey, data })
      },
      error => { if (active && !controller.signal.aborted) setResult({ key: requestKey, error }) },
    )
    return () => { active = false; controller.abort() }
  }, [query, requestKey, page, permitted, setParams])

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    setLogoutError(null)
    try { await logout() }
    catch { setLogoutError('No se pudo cerrar la sesión. Intenta nuevamente.') }
    finally { setLoggingOut(false) }
  }

  if (!permitted) return <ForbiddenPage permission="files:read" />
  const latest = result?.key === requestKey ? result : null
  const loading = !latest
  const data = latest?.data
  const error = latest?.error
  const totalPages = data?.totalPages ?? 0
  return <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm tracking-widest text-sky-300">LUMON · MDR</p><h1 className="text-3xl font-semibold">Archivos de datos</h1>
        <p className="text-slate-300">{me?.displayName} · {me?.team.code}</p></div>
      <nav className="flex gap-4" aria-label="Navegación principal">
        <Link to="/estado" className="text-sky-300 underline">Estado</Link>
        <button type="button" onClick={() => void handleLogout()} disabled={loggingOut} className="underline disabled:opacity-50">{loggingOut ? 'Cerrando…' : 'Cerrar sesión'}</button>
      </nav>
    </header>
    {logoutError && <p role="alert" className="text-red-300">{logoutError}</p>}
    <section aria-label="Filtros de archivos" className="grid gap-4 rounded border border-slate-700 p-4 sm:grid-cols-2">
      <Search q={q} onSearch={search} />
      <label className="grid gap-1">Estado
        <select value={current.get('status') ?? ''} onChange={event => change({ status: event.target.value })} className={control}>
          <option value="">Todos</option><option value="ACTIVE">Activos</option><option value="COMPLETE">Completados</option>
        </select>
      </label>
      <label className="grid gap-1">Orden
        <select value={current.get('sort') ?? sorts[0]} onChange={event => change({ sort: event.target.value })} className={control}>
          <option value="updatedAt,desc">Actualizados recientemente</option><option value="name,asc">Nombre: A–Z</option><option value="progress,desc">Mayor progreso</option>
        </select>
      </label>
      <label className="grid gap-1">Archivos por página
        <select value={size} onChange={event => change({ size: event.target.value })} className={control}>
          {[10, 25, 50].map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
    </section>
    <section aria-label="Resultados" aria-busy={loading} className="grid gap-4">
      {loading && <p role="status">Cargando archivos…</p>}
      {Boolean(error) && <div role="alert" className="grid gap-3 rounded border border-red-400 p-4">
        <p>{error instanceof ApiError ? error.message : 'No se pudieron cargar los archivos.'}</p>
        <button type="button" className={button} onClick={() => setRetry(value => value + 1)}>Reintentar</button>
      </div>}
      {data && <>
        <p role="status">{data.totalElements} archivos · Página {data.totalPages ? data.page + 1 : 0} de {data.totalPages}</p>
        {!data.content.length && <p>No hay archivos con estos filtros. Prueba con otra búsqueda o estado.</p>}
        {data.content.map(file => <article key={file.id} className="grid gap-4 rounded border border-slate-700 bg-slate-900/50 p-5">
          <div className="flex flex-wrap justify-between gap-3">
            <h2 className="text-xl font-semibold">{file.name}</h2><span>{file.status === 'COMPLETE' ? 'Completado' : 'Activo'}</span>
          </div>
          <p className="text-sm text-slate-300">{file.rows} × {file.cols} celdas · {file.refinedGroups}/{file.totalGroups} grupos · {file.mistakes} errores</p>
          <BinBars progress={file.progress} />
          <Link to={`/files/${file.id}/refine`} className="justify-self-start rounded bg-sky-700 px-4 py-2 font-medium text-white hover:bg-sky-600">
            {file.status === 'COMPLETE' ? 'Ver archivo completado' : can('files:refine') ? 'Abrir para refinar' : 'Ver archivo (solo lectura)'}
          </Link>
        </article>)}
      </>}
    </section>
    <nav aria-label="Paginación" className="flex items-center justify-between gap-4">
      <button type="button" className={button} disabled={loading || !data || page === 0} onClick={() => change({ page: String(page - 1) })}>Anterior</button>
      <span>Página {data && totalPages ? page + 1 : 0} de {totalPages}</span>
      <button type="button" className={button} disabled={loading || !data || page + 1 >= totalPages} onClick={() => change({ page: String(page + 1) })}>Siguiente</button>
    </nav>
  </main>
}


