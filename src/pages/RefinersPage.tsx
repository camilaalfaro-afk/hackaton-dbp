import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ForbiddenPage } from './ForbiddenPage'
import { control, errorMessage, safeUrl, useDirectoryParams, useResource } from './expedientes'
import type { Department, Page, Refiner } from './expedientes'

function Search({ value, change }: { value: string; change: (text: string) => void }) {
  const [draft, setDraft] = useState({ source: value, text: value })
  if (draft.source !== value) setDraft({ source: value, text: value })
  useEffect(() => {
    if (draft.text.trim() === value) return
    const timer = setTimeout(() => change(draft.text.trim()), 400)
    return () => clearTimeout(timer)
  }, [draft.text, value, change])
  return <label className="grid gap-1">Buscar personal<input type="search" maxLength={60} className={control} value={draft.text} onChange={event => setDraft({ source: value, text: event.target.value })} /></label>
}
export function RefinersPage() {
  const { can } = useAuth()
  const allowed = can('refiners:read')
  const { query, params, change } = useDirectoryParams(true)
  const list = useResource<Page<Refiner>>(allowed ? `/refiners?${query}` : null)
  const departments = useResource<Department[]>(allowed ? '/departments' : null)
  const page = Number(params.get('page'))
  const maxPage = Math.max(0, (list.data?.totalPages ?? 1) - 1)
  useEffect(() => { if (list.data && page > maxPage) change({ page: String(maxPage) }, true) }, [list.data, page, maxPage, change])
  if (!allowed) return <ForbiddenPage permission="refiners:read" />
  return <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8">
    <h1 className="text-3xl font-semibold">Directorio del personal</h1>
    <nav className="flex gap-4"><Link to="/files" className="underline">Archivos</Link>{can('incidents:read') && <Link to="/incidents" className="underline">Incidencias</Link>}<Link to="/estado" className="underline">Estado</Link></nav>
    <div className="grid gap-3 sm:grid-cols-3">
      <Search value={params.get('q') ?? ''} change={q => change({ q })} />
      <label className="grid gap-1">Departamento<select className={control} value={params.get('departmentId') ?? ''} disabled={departments.loading} onChange={event => change({ departmentId: event.target.value })}>
        <option value="">Todos</option>
        {params.get('departmentId') && !departments.data?.some(item => String(item.id) === params.get('departmentId')) && <option value={params.get('departmentId')!}>Departamento {params.get('departmentId')}</option>}
        {departments.data?.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
      </select></label>
      <label className="grid gap-1">Por página<select className={control} value={params.get('size')!} onChange={event => change({ size: event.target.value })}>{[10, 25, 50].map(size => <option key={size}>{size}</option>)}</select></label>
    </div>
    {Boolean(departments.error) && <div role="alert">{errorMessage(departments.error)} <button className={control} onClick={departments.retry}>Reintentar departamentos</button></div>}
    {list.loading && <p role="status">Cargando expedientes…</p>}
    {Boolean(list.error) && <div role="alert">{errorMessage(list.error)} <button className={control} onClick={list.retry}>Reintentar</button></div>}
    {list.data && <><p role="status">{list.data.totalElements} expedientes</p><div className="grid gap-4 sm:grid-cols-2">
      {list.data.content.map(person => <article key={person.id} className="grid gap-3 rounded border border-slate-600 p-4">
        {safeUrl(person.badge?.url) ? <img src={safeUrl(person.badge?.url)} width={112} height={112} loading="lazy" decoding="async" referrerPolicy="no-referrer" alt={`Fotocheck de ${person.fullName}`} className="h-28 w-28 rounded bg-slate-800 object-cover" onError={event => { event.currentTarget.style.visibility = 'hidden' }} /> : <div className="grid h-28 w-28 place-items-center rounded bg-slate-800 text-sm" role="img" aria-label="Sin fotocheck">Sin foto</div>}
        <h2 className="text-xl font-semibold">{person.fullName}</h2><p>{person.department.name} · {person.title}</p><p>Anexo: {person.extension}</p><p className="whitespace-pre-wrap break-words">{person.bio}</p>
        {safeUrl(person.profileUrl) && <a href={safeUrl(person.profileUrl)} target="_blank" rel="noopener noreferrer" className="underline">Perfil externo</a>}
        {can('refiners:write') && can('media:upload') && <Link to={`/refiners/${person.id}/badge`} className="underline">Editar fotocheck</Link>}
      </article>)}
    </div>{!list.data.content.length && <p>No se encontraron expedientes. Cambia la búsqueda o el departamento.</p>}</>}
    <nav aria-label="Paginación" className="flex justify-between gap-4"><button className={control} disabled={!list.data || list.loading || page === 0} onClick={() => change({ page: String(page - 1) })}>Anterior</button><span>Página {list.data?.totalPages ? page + 1 : 0} de {list.data?.totalPages ?? 0}</span><button className={control} disabled={!list.data || list.loading || page >= maxPage} onClick={() => change({ page: String(page + 1) })}>Siguiente</button></nav>
  </main>
}
