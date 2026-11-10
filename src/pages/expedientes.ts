import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { ApiError } from '../lib/http'
import { withRetry } from '../lib/retry'

export interface Page<T> { content: T[]; page: number; size: number; totalElements: number; totalPages: number }
export interface Photo { mediaId: number; url: string; width: number; height: number }
export interface Department { id: number; code: string; name: string }
export interface Refiner { id: number; fullName: string; title: string; bio: string; extension: string; profileUrl: string | null; department: Department; badge: Omit<Photo, 'mediaId'> | null }
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export interface Incident { id: number; title: string; description: string; severity: Severity; file: { id: number; name: string } | null; photos: Photo[]; createdBy: { displayName: string }; createdAt: string }
export const control = 'rounded border border-slate-500 bg-slate-900 px-3 py-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-sky-300'

export function safeUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined } catch { return undefined }
}
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 423) return 'El Piso de Pruebas está cerrado. Completa la revisión desde Estado.'
    if (error.code === 'MEDIA_NOT_USABLE') return 'Una foto ya fue usada o no es válida. Conservamos el formulario; reemplaza las fotos indicadas.'
    return error.message
  }
  return error instanceof Error ? error.message : 'No se pudo completar la operación.'
}
export function useResource<T>(url: string | null) {
  const [retry, setRetry] = useState(0)
  const key = `${url}|${retry}`
  const [result, setResult] = useState<{ key: string; data?: T; error?: unknown } | null>(null)
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    let active = true
    withRetry(signal => api<T>(url, { signal }), controller.signal, 3).then(
      data => { if (active) setResult({ key, data }) },
      error => { if (active && !controller.signal.aborted) setResult({ key, error }) },
    )
    return () => { active = false; controller.abort() }
  }, [url, key])
  return { data: result?.key === key ? result.data : undefined, error: result?.key === key ? result.error : undefined, loading: Boolean(url) && result?.key !== key, retry: () => setRetry(value => value + 1) }
}
export function useDirectoryParams(directory = false) {
  const [raw, setParams] = useSearchParams()
  const clean = new URLSearchParams()
  const page = raw.get('page') ?? '0'
  clean.set('page', /^\d+$/.test(page) && Number.isSafeInteger(Number(page)) ? String(Number(page)) : '0')
  clean.set('size', ['10', '25', '50'].includes(raw.get('size') ?? '') ? raw.get('size')! : '10')
  if (directory) {
    const q = (raw.get('q') ?? '').trim().slice(0, 60)
    if (q) clean.set('q', q)
    const department = raw.get('departmentId') ?? ''
    if (/^[1-9]\d*$/.test(department) && Number.isSafeInteger(Number(department))) clean.set('departmentId', department)
  }
  const query = clean.toString(), rawQuery = raw.toString()
  useEffect(() => { if (rawQuery !== query) setParams(query, { replace: true }) }, [rawQuery, query, setParams])
  function change(patch: Record<string, string>, replace = false) {
    const next = new URLSearchParams(query)
    for (const [name, value] of Object.entries(patch)) { if (value) next.set(name, value); else next.delete(name) }
    if (!('page' in patch)) next.set('page', '0')
    setParams(next, { replace })
  }
  return { query, params: new URLSearchParams(query), change }
}

/** Contract for A: returns ONLY confirmed INCIDENT media; onProgress is a real 0..1 upload fraction. */
export type IncidentUploader = (file: File, options: { purpose: 'INCIDENT'; signal: AbortSignal; onProgress: (fraction: number) => void }) => Promise<Photo & { purpose: 'INCIDENT' }>
/** A's real pipeline is loaded only when a photo is selected. */
export async function uploadIncidentPhoto(file: File, options: Parameters<IncidentUploader>[1]): ReturnType<IncidentUploader> {
  const checkAbort = () => { if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError') }
  checkAbort()
  const [processing, uploading] = await Promise.all([import('../media/processImage'), import('../media/upload')])
  checkAbort()
  const bitmap = await processing.loadBitmap(file)
  let image: Awaited<ReturnType<typeof processing.makeIncidentPhoto>>
  try { checkAbort(); image = await processing.makeIncidentPhoto(bitmap) } finally { bitmap.close() }
  checkAbort()
  const handle = uploading.uploadImage('INCIDENT', image, options.onProgress)
  const cancel = () => handle.cancel()
  options.signal.addEventListener('abort', cancel, { once: true })
  if (options.signal.aborted) cancel()
  try {
    const media = await handle.promise
    checkAbort()
    if (media.purpose !== 'INCIDENT') throw new Error('La imagen confirmada no corresponde a una incidencia.')
    return { ...media, purpose: 'INCIDENT' }
  } finally { options.signal.removeEventListener('abort', cancel) }
}

