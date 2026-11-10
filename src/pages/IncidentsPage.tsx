import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ForbiddenPage } from './ForbiddenPage'
import { control, errorMessage, safeUrl, useDirectoryParams, useResource } from './expedientes'
import type { Incident, Page } from './expedientes'

export function IncidentsPage() {
  const { can } = useAuth()
  const allowed = can('incidents:read')
  const { query, params, change } = useDirectoryParams()
  const list = useResource<Page<Incident>>(allowed ? `/incidents?${query}` : null)
  const page = Number(params.get('page'))
  const maxPage = Math.max(0, (list.data?.totalPages ?? 1) - 1)
  useEffect(() => { if (list.data && page > maxPage) change({ page: String(maxPage) }, true) }, [list.data, page, maxPage, change])
  if (!allowed) return <ForbiddenPage permission="incidents:read" />
  return <main className="mx-auto grid max-w-5xl gap-5 px-4 py-8">
    <h1 className="text-3xl font-semibold">Incidencias</h1>
    <nav className="flex flex-wrap gap-4"><Link to="/files" className="underline">Archivos</Link>{can('refiners:read') && <Link to="/refiners" className="underline">Personal</Link>}{can('incidents:create') && can('media:upload') && <Link to="/incidents/new" className="underline">Nueva incidencia</Link>}</nav>
    <label>Por página <select className={control} value={params.get('size')!} onChange={event => change({ size: event.target.value })}>{[10, 25, 50].map(size => <option key={size}>{size}</option>)}</select></label>
    {list.loading && <p role="status">Cargando incidencias…</p>}
    {Boolean(list.error) && <div role="alert">{errorMessage(list.error)} <button className={control} onClick={list.retry}>Reintentar</button></div>}
    {list.data && <><p role="status">{list.data.totalElements} incidencias</p>{!list.data.content.length && <p>Todavía no hay incidencias.</p>}{list.data.content.map(incident => <article key={incident.id} className="grid gap-3 rounded border border-slate-600 p-5">
      <h2 className="text-xl font-semibold">{incident.title}</h2><p>Gravedad: {incident.severity}</p><p className="whitespace-pre-wrap break-words">{incident.description}</p><p>Reportado por {incident.createdBy.displayName}</p><p>{new Date(incident.createdAt).toLocaleString('es-PE')}</p>
      {incident.file && <p>Archivo: {incident.file.name}</p>}
      <div className="grid gap-3 sm:grid-cols-3">{incident.photos.map(photo => safeUrl(photo.url) ? <a key={photo.mediaId} href={safeUrl(photo.url)} target="_blank" rel="noopener noreferrer"><img src={safeUrl(photo.url)} alt={`Foto de la incidencia ${incident.title}`} loading="lazy" decoding="async" width={320} height={240} referrerPolicy="no-referrer" className="h-48 w-full rounded bg-slate-800 object-contain" /></a> : <p key={photo.mediaId}>Imagen no disponible</p>)}</div>
    </article>)}</>}
    <nav aria-label="Paginación" className="flex justify-between"><button className={control} disabled={!list.data || list.loading || page === 0} onClick={() => change({ page: String(page - 1) })}>Anterior</button><span>Página {list.data?.totalPages ? page + 1 : 0} de {list.data?.totalPages ?? 0}</span><button className={control} disabled={!list.data || list.loading || page >= maxPage} onClick={() => change({ page: String(page + 1) })}>Siguiente</button></nav>
  </main>
}
