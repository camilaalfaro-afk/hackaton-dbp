import { api } from '../lib/api'
import { ApiError } from '../lib/http'
import type { BinCode, Tile } from '../types/api'
import { binFromChar, charFromBin } from './rules'

const MAX_CONCURRENT = 4
const MAX_RETRIES = 5
const DEFAULT_RATE_LIMIT_WAIT = 5

export interface GridMeta {
  fileId: number
  rows: number
  cols: number
  tileSize: number
}

export interface CellRef {
  r: number
  c: number
}

export interface Cell extends CellRef {
  value: number
  tremor: number
  bin: BinCode | null
}

/** Visible cells, both ends inclusive. */
export interface CellRange {
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
}

export type TileState = 'idle' | 'loading' | 'loaded' | 'error'

interface TileData {
  originRow: number
  originCol: number
  rows: number
  cols: number
  values: string
  tremor: Uint8Array
  bins: string
}

interface PendingTile {
  promise: Promise<TileData>
  controller: AbortController
  /** A pinned request is needed by a group search: leaving the viewport does not cancel it. */
  pins: number
}

export interface TileStore {
  readonly meta: GridMeta
  /** Null while the tile of that cell is not loaded. */
  getCell(r: number, c: number): Cell | null
  /** Loads the tile of a cell if needed. Used by the group search. */
  ensureCell(r: number, c: number, signal?: AbortSignal): Promise<Cell | null>
  tileState(tileRow: number, tileCol: number): TileState
  /** Requests the tiles of the visible range and cancels the ones that left it. */
  setViewport(range: CellRange): void
  /** Marks cells as refined in the cache, without asking the server again. */
  markRefined(cells: readonly CellRef[], bin: BinCode): void
  /** Drops tiles and requests them again (after a 409 ALREADY_REFINED). */
  reloadTiles(tiles: ReadonlyArray<readonly [tileRow: number, tileCol: number]>): void
  /** Milliseconds left of the rate-limit pause, 0 if none. */
  pauseRemaining(): number
  subscribe(listener: () => void): () => void
  /** Changes on every update. For useSyncExternalStore. */
  getVersion(): number
  dispose(): void
}

function keyOf(tileRow: number, tileCol: number): string {
  return `${tileRow}:${tileCol}`
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError')
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Stops waiting when the caller cancels, without cancelling the shared request. */
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    const onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function backoff(attempt: number): number {
  return Math.min(8000, 500 * 2 ** attempt) + Math.random() * 250
}

function decodeTile(tile: Tile): TileData {
  // Base64 to bytes: one byte per cell.
  const binary = atob(tile.tremor)
  const tremor = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) tremor[i] = binary.charCodeAt(i)

  const cells = tile.rows * tile.cols
  if (tile.values.length !== cells || tremor.length !== cells || tile.bins.length !== cells) {
    throw new ApiError({ status: 0, code: 'TILE_MALFORMED', message: 'El bloque llegó incompleto.' })
  }
  return {
    originRow: tile.originRow,
    originCol: tile.originCol,
    rows: tile.rows,
    cols: tile.cols,
    values: tile.values,
    tremor,
    bins: tile.bins,
  }
}

export function createTileStore(meta: GridMeta): TileStore {
  const tiles = new Map<string, TileData>()
  const pending = new Map<string, PendingTile>()
  const failed = new Set<string>()
  const listeners = new Set<() => void>()
  const maxTileRow = Math.ceil(meta.rows / meta.tileSize) - 1
  const maxTileCol = Math.ceil(meta.cols / meta.tileSize) - 1

  let version = 0
  // After a 429 nobody requests tiles until this moment.
  let pausedUntil = 0
  let active = 0
  const waiting: Array<() => void> = []

  function emit(): void {
    version += 1
    for (const listener of listeners) listener()
  }

  async function acquireSlot(signal: AbortSignal): Promise<void> {
    while (active >= MAX_CONCURRENT) {
      await new Promise<void>((resolve, reject) => {
        const wake = () => {
          signal.removeEventListener('abort', onAbort)
          resolve()
        }
        function onAbort() {
          const index = waiting.indexOf(wake)
          if (index >= 0) waiting.splice(index, 1)
          reject(abortError())
        }
        if (signal.aborted) {
          reject(abortError())
          return
        }
        signal.addEventListener('abort', onAbort, { once: true })
        waiting.push(wake)
      })
    }
    active += 1
  }

  function releaseSlot(): void {
    active -= 1
    waiting.shift()?.()
  }

  async function fetchTile(tileRow: number, tileCol: number, signal: AbortSignal): Promise<TileData> {
    let attempt = 0
    for (;;) {
      let wait: number
      await acquireSlot(signal)
      try {
        // Checked after getting a slot, so a queued request never fires during the pause.
        wait = pausedUntil - Date.now()
        if (wait <= 0) {
          const tile = await api<Tile>(`/files/${meta.fileId}/tiles/${tileRow}/${tileCol}`, { signal })
          return decodeTile(tile)
        }
      } catch (error) {
        if (!(error instanceof ApiError)) throw error

        if (error.status === 429) {
          // The whole session is limited: pause every tile request, then try again.
          const seconds = error.retryAfter ?? DEFAULT_RATE_LIMIT_WAIT
          pausedUntil = Math.max(pausedUntil, Date.now() + seconds * 1000)
          wait = pausedUntil - Date.now()
          emit()
        } else {
          const transient = error.status === 503 || error.code === 'NETWORK_ERROR'
          if (!transient || attempt >= MAX_RETRIES) throw error
          wait = Math.max((error.retryAfter ?? 0) * 1000, backoff(attempt))
          attempt += 1
        }
      } finally {
        releaseSlot()
      }
      await sleep(wait, signal)
    }
  }

  /** One request per tile at most: cached, already in flight, or new. */
  function load(tileRow: number, tileCol: number): Promise<TileData> {
    const key = keyOf(tileRow, tileCol)
    const cached = tiles.get(key)
    if (cached) return Promise.resolve(cached)
    const existing = pending.get(key)
    if (existing) return existing.promise

    const controller = new AbortController()
    const entry: PendingTile = {
      controller,
      pins: 0,
      promise: fetchTile(tileRow, tileCol, controller.signal).then(
        (tile) => {
          if (pending.get(key) === entry) pending.delete(key)
          tiles.set(key, tile)
          failed.delete(key)
          emit()
          return tile
        },
        (error: unknown) => {
          if (pending.get(key) === entry) pending.delete(key)
          if (error instanceof ApiError) failed.add(key)
          emit()
          throw error
        },
      ),
    }
    pending.set(key, entry)
    failed.delete(key)
    emit()
    return entry.promise
  }

  function inBounds(r: number, c: number): boolean {
    return r >= 0 && c >= 0 && r < meta.rows && c < meta.cols
  }

  function tileOf(r: number, c: number): [number, number] {
    return [Math.floor(r / meta.tileSize), Math.floor(c / meta.tileSize)]
  }

  function getCell(r: number, c: number): Cell | null {
    if (!inBounds(r, c)) return null
    const [tileRow, tileCol] = tileOf(r, c)
    const tile = tiles.get(keyOf(tileRow, tileCol))
    if (!tile) return null
    const index = (r - tile.originRow) * tile.cols + (c - tile.originCol)
    return {
      r,
      c,
      value: Number(tile.values[index]),
      tremor: tile.tremor[index],
      bin: binFromChar(tile.bins[index]),
    }
  }

  async function ensureCell(r: number, c: number, signal?: AbortSignal): Promise<Cell | null> {
    if (!inBounds(r, c)) return null
    const loaded = getCell(r, c)
    if (loaded) return loaded

    const [tileRow, tileCol] = tileOf(r, c)
    const promise = load(tileRow, tileCol)
    const entry = pending.get(keyOf(tileRow, tileCol))
    if (entry) entry.pins += 1
    try {
      await abortable(promise, signal)
    } finally {
      if (entry) entry.pins -= 1
    }
    return getCell(r, c)
  }

  function setViewport(range: CellRange): void {
    const [firstRow, firstCol] = tileOf(Math.max(0, range.rowStart), Math.max(0, range.colStart))
    const [lastRow, lastCol] = tileOf(
      Math.min(meta.rows - 1, range.rowEnd),
      Math.min(meta.cols - 1, range.colEnd),
    )

    const wanted = new Set<string>()
    for (let tileRow = firstRow; tileRow <= Math.min(lastRow, maxTileRow); tileRow += 1) {
      for (let tileCol = firstCol; tileCol <= Math.min(lastCol, maxTileCol); tileCol += 1) {
        wanted.add(keyOf(tileRow, tileCol))
        // Errors stay in `failed`; the grid reads them through tileState().
        load(tileRow, tileCol).catch(() => undefined)
      }
    }

    // Tiles that left the view before answering are cancelled.
    for (const [key, entry] of pending) {
      if (!wanted.has(key) && entry.pins === 0) entry.controller.abort()
    }
  }

  function tileState(tileRow: number, tileCol: number): TileState {
    const key = keyOf(tileRow, tileCol)
    if (tiles.has(key)) return 'loaded'
    if (pending.has(key)) return 'loading'
    return failed.has(key) ? 'error' : 'idle'
  }

  function markRefined(cells: readonly CellRef[], bin: BinCode): void {
    const char = charFromBin(bin)
    const touched = new Map<string, string[]>()
    for (const { r, c } of cells) {
      if (!inBounds(r, c)) continue
      const [tileRow, tileCol] = tileOf(r, c)
      const key = keyOf(tileRow, tileCol)
      const tile = tiles.get(key)
      if (!tile) continue
      const chars = touched.get(key) ?? [...tile.bins]
      chars[(r - tile.originRow) * tile.cols + (c - tile.originCol)] = char
      touched.set(key, chars)
    }
    for (const [key, chars] of touched) {
      const tile = tiles.get(key)
      if (tile) tiles.set(key, { ...tile, bins: chars.join('') })
    }
    if (touched.size > 0) emit()
  }

  function reloadTiles(targets: ReadonlyArray<readonly [number, number]>): void {
    for (const [tileRow, tileCol] of targets) {
      const key = keyOf(tileRow, tileCol)
      pending.get(key)?.controller.abort()
      pending.delete(key)
      tiles.delete(key)
      load(tileRow, tileCol).catch(() => undefined)
    }
    emit()
  }

  return {
    meta,
    getCell,
    ensureCell,
    tileState,
    setViewport,
    markRefined,
    reloadTiles,
    pauseRemaining: () => Math.max(0, pausedUntil - Date.now()),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getVersion: () => version,
    dispose() {
      // Cancels what is in flight. The cache stays valid if the grid mounts again.
      for (const entry of pending.values()) entry.controller.abort()
      pending.clear()
    },
  }
}
