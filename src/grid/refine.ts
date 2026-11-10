import { apiResponse } from '../lib/api'
import { ApiError } from '../lib/http'
import { isTransient, withRetry } from '../lib/retry'
import type { BinCode, RefineResult } from '../types/api'
import type { CellRef } from './tileCache'

export type TilePair = readonly [tileRow: number, tileCol: number]

export type RefineOutcome =
  | { kind: 'done'; result: RefineResult; replayed: boolean }
  | {
      kind: 'rejected'
      message: string
      /** True when the server stored the answer: the next attempt is a new intention. */
      final: boolean
      reloadTiles: TilePair[]
      mistakes: number | null
    }

const INVALID_REASONS: Record<string, string> = {
  BELOW_THRESHOLD: 'Hay celdas que no dan miedo en el grupo.',
  NOT_CONNECTED: 'Las celdas pertenecen a más de un grupo.',
  INCOMPLETE: 'Al grupo le faltan celdas. Vuelve a seleccionarlo.',
  SIZE_OUT_OF_RANGE: 'El grupo es ruido: su tamaño está fuera del rango permitido.',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function tilesOf(details: unknown): TilePair[] {
  if (!isRecord(details) || !Array.isArray(details.tiles)) return []
  const pairs: TilePair[] = []
  for (const item of details.tiles as unknown[]) {
    if (Array.isArray(item) && typeof item[0] === 'number' && typeof item[1] === 'number') {
      pairs.push([item[0], item[1]])
    }
  }
  return pairs
}

function rejected(message: string, final: boolean, extra: { reloadTiles?: TilePair[]; mistakes?: number } = {}): RefineOutcome {
  return { kind: 'rejected', message, final, reloadTiles: extra.reloadTiles ?? [], mistakes: extra.mistakes ?? null }
}

function explain(error: ApiError): RefineOutcome {
  const details = isRecord(error.details) ? error.details : {}
  switch (error.code) {
    case 'ALREADY_REFINED':
      return rejected('Ese grupo ya estaba refinado. Se actualizaron los bloques afectados.', true, {
        reloadTiles: tilesOf(details),
      })
    case 'GROUP_CLAIMED': {
      const holder = isRecord(details.holder) && typeof details.holder.displayName === 'string' ? details.holder.displayName : 'otro refinador'
      return rejected(`El grupo está reservado por ${holder}. Inténtalo cuando lo libere.`, false)
    }
    case 'WRONG_BIN':
      return rejected('Caja equivocada. Lumon anotó el error: revisa la caja sugerida.', true, {
        mistakes: typeof details.mistakes === 'number' ? details.mistakes : undefined,
      })
    case 'GROUP_INVALID': {
      const reason = typeof details.reason === 'string' ? details.reason : ''
      return rejected(INVALID_REASONS[reason] ?? 'El grupo no es válido. Vuelve a seleccionarlo.', true)
    }
    case 'FORBIDDEN':
      return rejected('Tu rol no puede refinar.', true)
    default:
      return rejected(error.message, !isTransient(error))
  }
}

/**
 * Sends a group to a bin. The key identifies the user's intention: every retry of this
 * call reuses it, so a refinement saved before a 503 is never applied twice.
 */
export async function refineGroup(
  fileId: number,
  idempotencyKey: string,
  bin: BinCode,
  cells: readonly CellRef[],
  signal?: AbortSignal,
): Promise<RefineOutcome> {
  try {
    const response = await withRetry(
      (s) =>
        apiResponse<RefineResult>(`/files/${fileId}/refinements`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: { bin, cells },
          signal: s,
        }),
      signal,
    )
    return {
      kind: 'done',
      result: response.data,
      replayed: response.headers.get('Idempotent-Replayed') === 'true',
    }
  } catch (error) {
    if (error instanceof ApiError) return explain(error)
    throw error
  }
}
