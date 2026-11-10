import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'
import { ApiError, fieldErrorsOf } from '../lib/http'
import { ForbiddenPage } from './ForbiddenPage'
import { control, errorMessage, uploadIncidentPhoto } from './expedientes'
import type { Incident, IncidentUploader, Photo, Severity } from './expedientes'

type PhotoState = { id: string; file: File; preview: string; status: 'uploading' | 'confirmed' | 'error' | 'cancelled'; progress: number; media?: Photo; error?: string }

export function IncidentNewPage({ uploadPhoto = uploadIncidentPhoto }: { uploadPhoto?: IncidentUploader }) {
  const { can } = useAuth()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<Severity>('MEDIUM')
  const [fileId, setFileId] = useState('')
  const [photos, setPhotos] = useState<PhotoState[]>([])
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<number | null>(null)
  const controllers = useRef(new Map<string, AbortController>())
  const previews = useRef(new Set<string>())
  const mounted = useRef(true)
  const busy = useRef(false)
  const allowed = can('incidents:create') && can('media:upload')
  useEffect(() => {
    const activeControllers = controllers.current, activePreviews = previews.current
    mounted.current = true
    return () => { mounted.current = false; activeControllers.forEach(item => item.abort()); activeControllers.clear(); activePreviews.forEach(url => URL.revokeObjectURL(url)); activePreviews.clear() }
  }, [])

  async function upload(photo: PhotoState) {
    if (busy.current) return
    controllers.current.get(photo.id)?.abort()
    const controller = new AbortController()
    controllers.current.set(photo.id, controller)
    const current = () => mounted.current && controllers.current.get(photo.id) === controller && !controller.signal.aborted
    setPhotos(list => list.map(item => item.id === photo.id ? { ...item, status: 'uploading', progress: 0, error: undefined, media: undefined } : item))
    try {
      const media = await uploadPhoto(photo.file, { purpose: 'INCIDENT', signal: controller.signal, onProgress: value => {
        if (current()) setPhotos(list => list.map(item => item.id === photo.id ? { ...item, progress: Math.max(0, Math.min(1, value)) } : item))
      } })
      if (!current()) return
      const side = Math.max(media.width, media.height)
      if (media.purpose !== 'INCIDENT' || !Number.isSafeInteger(media.mediaId) || media.mediaId < 1 || side < 800 || side > 1600) throw new Error('La tubería no devolvió una imagen INCIDENT confirmada con dimensiones válidas.')
      setPhotos(list => list.map(item => item.id === photo.id ? { ...item, status: 'confirmed', media, progress: 1 } : item))
    } catch (caught) {
      if (current()) setPhotos(list => list.map(item => item.id === photo.id ? { ...item, status: 'error', error: errorMessage(caught) } : item))
    } finally { if (controllers.current.get(photo.id) === controller) controllers.current.delete(photo.id) }
  }
  function addFiles(files: FileList | null) {
    if (!files || busy.current) return
    const selected = Array.from(files)
    if (photos.length + selected.length > 3) { setError('Puedes adjuntar entre 1 y 3 fotos. Quita una antes de agregar más.'); return }
    if (selected.some(file => !file.type.startsWith('image/'))) { setError('Selecciona únicamente archivos de imagen.'); return }
    const added: PhotoState[] = selected.map(file => {
      const preview = URL.createObjectURL(file)
      previews.current.add(preview)
      return { id: crypto.randomUUID(), file, preview, status: 'uploading', progress: 0 }
    })
    setError(null)
    setPhotos(list => [...list, ...added])
    // Start independently: all selected photos upload in parallel, with their own controllers.
    for (const photo of added) void upload(photo)
  }
  function cancel(id: string) {
    controllers.current.get(id)?.abort()
    controllers.current.delete(id)
    setPhotos(list => list.map(item => item.id === id ? { ...item, status: 'cancelled', error: undefined } : item))
  }
  function remove(photo: PhotoState) {
    if (busy.current) return
    controllers.current.get(photo.id)?.abort()
    controllers.current.delete(photo.id)
    URL.revokeObjectURL(photo.preview)
    previews.current.delete(photo.preview)
    setPhotos(list => list.filter(item => item.id !== photo.id))
  }
  const ready = photos.length >= 1 && photos.length <= 3 && photos.every(photo => photo.status === 'confirmed' && photo.media)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || !allowed) return
    const validation: Record<string, string> = {}
    if (title.trim().length < 3 || title.trim().length > 120) validation.title = 'El título debe tener entre 3 y 120 caracteres.'
    if (!description.trim() || description.length > 4000) validation.description = 'La descripción debe tener entre 1 y 4000 caracteres.'
    if (fileId && (!/^[1-9]\d*$/.test(fileId) || !Number.isSafeInteger(Number(fileId)))) validation.fileId = 'Ingresa un ID de archivo entero positivo o déjalo vacío.'
    setFields(validation)
    if (Object.keys(validation).length || !ready) { setError('Revisa el formulario y confirma entre 1 y 3 fotos antes de enviar.'); return }
    busy.current = true
    setSubmitting(true)
    setError(null)
    try {
      const result = await api<Incident>('/incidents', { method: 'POST', body: { title: title.trim(), description: description.trim(), severity, fileId: fileId ? Number(fileId) : null, mediaIds: photos.map(photo => photo.media!.mediaId) } })
      if (mounted.current) setCreated(result.id)
    } catch (caught) {
      if (!mounted.current) return
      setFields(fieldErrorsOf(caught))
      setError(errorMessage(caught))
      if (caught instanceof ApiError && caught.code === 'MEDIA_NOT_USABLE' && typeof caught.details === 'object' && caught.details !== null && 'mediaIds' in caught.details && Array.isArray(caught.details.mediaIds)) {
        const invalid = caught.details.mediaIds
        setPhotos(list => list.map(photo => photo.media && invalid.includes(photo.media.mediaId) ? { ...photo, status: 'error', error: 'Esta imagen no se puede usar. Reintenta su subida para obtener un medio nuevo.' } : photo))
      }
      // Inputs, files and already confirmed media survive all failures. Never auto-retry POST.
    } finally { busy.current = false; if (mounted.current) setSubmitting(false) }
  }
  if (!allowed) return <ForbiddenPage permission={can('incidents:create') ? 'media:upload' : 'incidents:create'} />
  if (created !== null) return <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8"><h1 className="text-3xl font-semibold">Incidencia registrada</h1><p role="status">Reporte #{created} enviado correctamente.</p><Link className="underline" to={can('incidents:read') ? '/incidents' : '/files'}>Volver</Link></main>
  return <main className="mx-auto grid max-w-3xl gap-5 px-4 py-8">
    <h1 className="text-3xl font-semibold">Nueva incidencia</h1><p>Adjunta entre 1 y 3 fotos. El envío se habilita cuando todas estén confirmadas.</p>
    <Link to={can('incidents:read') ? '/incidents' : '/files'} className="underline">Volver</Link>
    <form onSubmit={submit} noValidate aria-busy={submitting} className="grid gap-4">
      <fieldset disabled={submitting} className="grid gap-4">
        <legend className="sr-only">Datos de la incidencia</legend>
        <label className="grid gap-1">Título<input name="title" required minLength={3} maxLength={120} className={control} value={title} onChange={event => setTitle(event.target.value)} aria-invalid={Boolean(fields.title)} aria-describedby={fields.title ? 'title-error' : undefined} /></label>
        {fields.title && <p id="title-error" role="alert" className="text-red-300">{fields.title}</p>}
        <label className="grid gap-1">Descripción<textarea name="description" required maxLength={4000} rows={5} className={control} value={description} onChange={event => setDescription(event.target.value)} aria-invalid={Boolean(fields.description)} aria-describedby={fields.description ? 'description-error' : undefined} /></label>
        {fields.description && <p id="description-error" role="alert" className="text-red-300">{fields.description}</p>}
        <label className="grid gap-1">Gravedad<select className={control} value={severity} onChange={event => setSeverity(event.target.value as Severity)}>{(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="grid gap-1">ID del archivo relacionado (opcional)<input name="fileId" inputMode="numeric" className={control} value={fileId} onChange={event => setFileId(event.target.value)} aria-invalid={Boolean(fields.fileId)} /></label>
        {fields.fileId && <p role="alert" className="text-red-300">{fields.fileId}</p>}
        <label className="grid gap-1">Fotos<input type="file" accept="image/*" multiple disabled={photos.length >= 3} onChange={event => { addFiles(event.target.files); event.target.value = '' }} /></label>
        <div className="grid gap-4 sm:grid-cols-3">{photos.map(photo => <section key={photo.id} className="grid gap-2 rounded border border-slate-600 p-3" aria-label={photo.file.name}>
          <img src={photo.preview} alt={`Vista previa de ${photo.file.name}`} width={240} height={180} className="h-36 w-full object-contain" />
          <p className="break-all text-sm">{photo.file.name}</p>
          <progress value={photo.progress} max={1} aria-label={`Subida de ${photo.file.name}`} className="w-full" />
          <p role="status">{photo.status === 'confirmed' ? 'Confirmada' : photo.status === 'uploading' ? (photo.progress >= 1 ? 'Confirmando…' : `Subiendo ${Math.round(photo.progress * 100)}%`) : photo.status === 'cancelled' ? 'Cancelada' : 'Error'}</p>
          {photo.error && <p role="alert" className="text-sm text-red-300">{photo.error}</p>}
          {photo.status === 'uploading' && <button type="button" className={control} onClick={() => cancel(photo.id)}>Cancelar</button>}
          {(photo.status === 'error' || photo.status === 'cancelled') && <button type="button" className={control} onClick={() => void upload(photo)}>Reintentar foto</button>}
          <button type="button" className={control} onClick={() => remove(photo)}>Quitar foto</button>
        </section>)}</div>
      </fieldset>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <button type="submit" disabled={!ready || submitting} className="rounded bg-sky-700 px-4 py-3 font-semibold disabled:opacity-50">{submitting ? 'Enviando…' : 'Enviar incidencia'}</button>
    </form>
  </main>
}
