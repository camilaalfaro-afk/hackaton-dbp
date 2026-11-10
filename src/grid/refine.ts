import { api } from '../lib/api'
import { ApiError } from '../lib/http'
import type { BinCode, RefineResult } from '../types/api'
import type { CellRef, TileStore } from './tileCache'

export interface RefinementInput {
  fileId: number
  bin: BinCode
  cells: readonly CellRef[]
  store?: Pick<TileStore, 'markRefined' | 'reloadTiles'>
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

export function isRetryableRefinementError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status === 429 || error.status >= 500 || error.code === 'GROUP_CLAIMED')
}

export function refinementErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'No se pudo refinar. Conserva la selección y vuelve a intentar.'
  const details = record(error.details)
  switch (error.code) {
    case 'ALREADY_REFINED': return 'Otra operación ya refinó estas celdas. Se actualizaron los bloques afectados; selecciona un grupo de nuevo.'
    case 'GROUP_CLAIMED': {
      const name = record(details.holder).displayName
      return `El grupo está reservado${typeof name === 'string' ? ` por ${name}` : ''}. Espera a que se libere y reintenta.`
    }
    case 'WRONG_BIN': return 'La caja no corresponde al grupo. El servidor registró el error; elige otra caja como una intención nueva.'
    case 'IDEMPOTENCY_KEY_REUSED': return 'Esta clave pertenece a otra selección. Crea una intención nueva para cambiar celdas o caja.'
    case 'GROUP_INVALID':
      switch (details.reason) {
        case 'BELOW_THRESHOLD': return 'La selección incluye celdas que no dan miedo. Selecciona un grupo válido.'
        case 'NOT_CONNECTED': return 'Las celdas pertenecen a grupos distintos. Selecciona un único grupo completo.'
        case 'INCOMPLETE': return `El grupo está incompleto${typeof details.missing === 'number' ? `: faltan ${details.missing} celdas` : ''}. Vuelve a seleccionar el grupo completo.`
        case 'SIZE_OUT_OF_RANGE': return 'El grupo es ruido: su tamaño está fuera del rango permitido por las reglas.'
      }
      return 'El grupo no es válido. Revisa la selección y las reglas del archivo.'
    case 'SERVICE_UNAVAILABLE':
    case 'NETWORK_ERROR': return 'No se pudo confirmar el resultado. Reintenta la misma intención; conservará su clave para evitar duplicados.'
    case 'FORBIDDEN': return 'Tu cuenta no tiene permiso para refinar archivos.'
    default: return error.message
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
  })
}

function affectedTiles(error: ApiError): [number, number][] {
  const tiles = record(error.details).tiles
  if (!Array.isArray(tiles)) return []
  return tiles.filter((tile): tile is [number, number] => Array.isArray(tile) && tile.length === 2 && tile.every(value => Number.isInteger(value) && value >= 0))
}

/**
 * Create ONCE per user intention, then reuse submit() for every retry.
 * Changing cells or bin requires a new object. Concurrent submits share one request.
 * A successful replay is applied to the cache only once.
 */
export function createRefinement({ fileId, bin, cells, store }: RefinementInput) {
  if (!Number.isSafeInteger(fileId) || fileId <= 0) throw new Error('Archivo inválido.')
  if (!['WO', 'FC', 'DR', 'MA'].includes(bin)) throw new Error('Caja inválida.')
  if (!cells.length || cells.length > 500) throw new Error('Selecciona entre 1 y 500 celdas.')
  const body = { bin, cells: cells.map(({ r, c }) => ({ r, c })) }
  if (body.cells.some(({ r, c }) => !Number.isSafeInteger(r) || !Number.isSafeInteger(c) || r < 0 || c < 0)) throw new Error('Coordenadas inválidas.')
  if (new Set(body.cells.map(({ r, c }) => `${r}:${c}`)).size !== body.cells.length) throw new Error('La selección contiene celdas repetidas.')
  const idempotencyKey = crypto.randomUUID()
  let inFlight: Promise<RefineResult> | null = null
  let result: RefineResult | null = null
  let finalError: unknown = null
  let retryNotBefore = 0

  async function send(signal?: AbortSignal): Promise<RefineResult> {
    for (let attempt = 0; ; attempt += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      if (retryNotBefore > Date.now()) await wait(retryNotBefore - Date.now(), signal)
      try {
        const response = await api<RefineResult>(`/files/${fileId}/refinements`, {
          method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey }, signal,
        })
        result = response
        store?.markRefined(body.cells, response.bin)
        return response
      } catch (error) {
        if (error instanceof ApiError && error.code === 'ALREADY_REFINED') store?.reloadTiles(affectedTiles(error))
        if (!isRetryableRefinementError(error)) {
          if (error instanceof ApiError) finalError = error
          throw error
        }
        if (error instanceof ApiError) retryNotBefore = Date.now() + Math.max((error.retryAfter ?? 0) * 1000, Math.min(1000 * 2 ** attempt, 10000))
        // Reserved groups need a deliberate retry; transient network failures retry up to 3 times.
        if (attempt >= 3 || (error instanceof ApiError && error.code === 'GROUP_CLAIMED')) throw error
      }
    }
  }

  return {
    idempotencyKey,
    submit(signal?: AbortSignal): Promise<RefineResult> {
      if (result) return Promise.resolve(result)
      if (finalError) return Promise.reject(finalError)
      if (!inFlight) inFlight = send(signal).finally(() => { inFlight = null })
      return inFlight
    },
  }
}
