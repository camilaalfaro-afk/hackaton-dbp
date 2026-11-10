import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AppNav } from '../components/AppNav'
import { findGroup } from '../grid/groups'
import type { Group } from '../grid/groups'
import { refineGroup } from '../grid/refine'
import { createTileStore } from '../grid/tileCache'
import type { CellRef } from '../grid/tileCache'
import { VirtualGrid } from '../grid/VirtualGrid'
import { api } from '../lib/api'
import { ApiError } from '../lib/http'
import { withRetry } from '../lib/retry'
import type { BinCode, DataFile, Rules } from '../types/api'

const BINS: readonly BinCode[] = ['WO', 'FC', 'DR', 'MA']
const BIN_NAMES: Record<BinCode, string> = { WO: 'Woe', FC: 'Frolic', DR: 'Dread', MA: 'Malice' }
const NOISE_TEXT = {
  TOO_SMALL: 'Es ruido: el grupo es más chico que el mínimo.',
  TOO_LARGE: 'Es ruido: el grupo supera el tamaño máximo.',
}

type Selection = { status: 'idle' } | { status: 'searching' } | { status: 'ready'; group: Group }

interface Notice {
  tone: 'ok' | 'error' | 'info'
  text: string
}

function isBin(value: string | null | undefined): value is BinCode {
  return value === 'WO' || value === 'FC' || value === 'DR' || value === 'MA'
}

/** A position from the URL, kept inside the grid. Anything invalid becomes 0. */
function positionFrom(raw: string | null, limit: number): number {
  const value = Number(raw)
  return Number.isInteger(value) && value >= 0 ? Math.min(value, limit - 1) : 0
}

function Refiner({ initialFile, rules }: { initialFile: DataFile; rules: Rules }) {
  const { can } = useAuth()
  const canRefine = can('files:refine')
  const [params, setParams] = useSearchParams()
  const [file, setFile] = useState(initialFile)
  const [store] = useState(() =>
    createTileStore({
      fileId: initialFile.id,
      rows: initialFile.rows,
      cols: initialFile.cols,
      tileSize: initialFile.tileSize,
    }),
  )
  const [focus, setFocus] = useState<CellRef>(() => ({
    r: positionFrom(params.get('r'), initialFile.rows),
    c: positionFrom(params.get('c'), initialFile.cols),
  }))
  const [selection, setSelection] = useState<Selection>({ status: 'idle' })
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const search = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  // One key per intention (this group to this bin). Retries of the same intention reuse it.
  const intent = useRef<{ signature: string; key: string } | null>(null)

  useEffect(
    () => () => {
      search.current?.abort()
      store.dispose()
    },
    [store],
  )

  const group = selection.status === 'ready' ? selection.group : null
  const selected = useMemo(
    () => new Set(group ? group.cells.map((cell) => cell.r * file.cols + cell.c) : []),
    [group, file.cols],
  )

  function activate(cell: CellRef) {
    if (selected.has(cell.r * file.cols + cell.c)) return
    search.current?.abort()
    const controller = new AbortController()
    search.current = controller
    setSelection({ status: 'searching' })
    setNotice(null)
    findGroup(store, rules, cell.r, cell.c, controller.signal).then(
      (found) => {
        if (controller.signal.aborted) return
        if (!found) {
          setSelection({ status: 'idle' })
          setNotice({ tone: 'info', text: 'Esa celda no da miedo.' })
          return
        }
        setSelection({ status: 'ready', group: found })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setSelection({ status: 'idle' })
        setNotice({
          tone: 'error',
          text: error instanceof ApiError ? error.message : 'No se pudo armar el grupo. Inténtalo de nuevo.',
        })
      },
    )
  }

  async function refine(bin: BinCode) {
    // A second click, a second Enter or a drop while sending is ignored.
    if (busyRef.current || !group) return
    if (!canRefine) {
      setNotice({ tone: 'error', text: 'Tu rol no puede refinar.' })
      return
    }
    if (group.refinedAs) {
      setNotice({ tone: 'info', text: `Ese grupo ya está en ${group.refinedAs}.` })
      return
    }
    if (group.noise) {
      setNotice({ tone: 'error', text: NOISE_TEXT[group.noise] })
      return
    }

    const cells = group.cells
    const signature = `${bin}|${cells.map((cell) => `${cell.r}:${cell.c}`).sort().join(',')}`
    if (intent.current?.signature !== signature) {
      intent.current = { signature, key: crypto.randomUUID() }
    }
    const { key } = intent.current

    busyRef.current = true
    setBusy(true)
    setNotice({ tone: 'info', text: `Llevando ${cells.length} celdas a ${bin}…` })
    try {
      const outcome = await refineGroup(file.id, key, bin, cells)
      if (outcome.kind === 'done') {
        intent.current = null
        // Mark the cells from what we already have: the grid is not requested again.
        store.markRefined(cells, bin)
        setFile((current) => ({ ...current, ...outcome.result.file }))
        setSelection({ status: 'idle' })
        setNotice({ tone: 'ok', text: `Grupo de ${outcome.result.size} celdas refinado en ${bin}.` })
        return
      }
      if (outcome.final) intent.current = null
      if (outcome.reloadTiles.length > 0) {
        store.reloadTiles(outcome.reloadTiles)
        setSelection({ status: 'idle' })
      }
      const { mistakes } = outcome
      if (mistakes !== null) setFile((current) => ({ ...current, mistakes }))
      setNotice({ tone: 'error', text: outcome.message })
    } catch {
      setNotice({ tone: 'error', text: 'No se pudo refinar. Inténtalo de nuevo.' })
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const dropOn = useEffectEvent((bin: BinCode) => {
    void refine(bin)
  })

  // Drag with Pointer Events: follow the pointer and drop on whatever bin is under it.
  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    const move = (event: PointerEvent) => setDrag({ x: event.clientX, y: event.clientY })
    const cancel = () => setDrag(null)
    const drop = (event: PointerEvent) => {
      setDrag(null)
      const target = document.elementFromPoint(event.clientX, event.clientY)
      const bin = target?.closest('[data-bin]')?.getAttribute('data-bin')
      if (isBin(bin)) dropOn(bin)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', drop)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', drop)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [dragging])

  function handleCellPointerDown(cell: CellRef, event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !selected.has(cell.r * file.cols + cell.c)) return
    event.preventDefault()
    setDrag({ x: event.clientX, y: event.clientY })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      search.current?.abort()
      setSelection({ status: 'idle' })
      return
    }
    const index = ['1', '2', '3', '4'].indexOf(event.key)
    if (index >= 0 && group) {
      event.preventDefault()
      void refine(BINS[index])
    }
  }

  function handleSettle(cell: CellRef) {
    // replace: scrolling must not fill the history.
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set('r', String(cell.r))
        next.set('c', String(cell.c))
        return next
      },
      { replace: true },
    )
  }

  if (file.status === 'COMPLETE') {
    return (
      <main className="mx-auto grid w-full max-w-xl gap-4 px-4 py-12 text-center">
        <h1 className="text-2xl font-semibold">Archivo completado</h1>
        <p>
          {file.name} llegó al 100 %: {file.refinedGroups} de {file.totalGroups} grupos refinados, con{' '}
          {file.mistakes} errores.
        </p>
        <Link to="/files" className="underline">
          Volver a los archivos
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto grid w-full max-w-[1700px] gap-4 px-4 py-6" onKeyDown={handleKeyDown}>
      <div className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl font-semibold">{file.name}</h1>
        <p className="text-sm text-slate-300">
          {file.rows} × {file.cols} · {file.refinedGroups} de {file.totalGroups} grupos · {file.mistakes} errores
        </p>
      </div>

      <section aria-label="Cajas" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {BINS.map((bin, index) => {
          const suggested = group?.bin === bin
          return (
            <button
              key={bin}
              type="button"
              data-bin={bin}
              disabled={busy || !group || !canRefine}
              onClick={() => void refine(bin)}
              className={`grid gap-1 rounded border px-3 py-2 text-left disabled:opacity-60 ${
                suggested ? 'border-white bg-slate-700' : 'border-slate-600 bg-slate-900'
              }`}
            >
              <span className="font-semibold">
                {bin} · {BIN_NAMES[bin]} <span className="text-sm font-normal text-slate-300">(tecla {index + 1})</span>
              </span>
              <progress max={1} value={file.progress[bin]} aria-label={`Progreso de la caja ${bin}`} className="w-full" />
              <span className="text-sm">{Math.round(file.progress[bin] * 100)} %</span>
            </button>
          )
        })}
      </section>

      <p role="status" aria-live="polite" className="min-h-6">
        {selection.status === 'searching' && 'Buscando el grupo completo…'}
        {group &&
          (group.refinedAs
            ? `Grupo de ${group.size} celdas, ya refinado en ${group.refinedAs}.`
            : group.noise
              ? `Grupo de ${group.size} celdas. ${NOISE_TEXT[group.noise]}`
              : `Grupo de ${group.size} celdas. Caja que corresponde: ${group.bin}. Arrástralo a la caja o pulsa su tecla.`)}
        {selection.status === 'idle' && 'Elige una celda que tiemble para seleccionar su grupo.'}
      </p>

      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={notice.tone === 'error' ? 'text-red-300' : notice.tone === 'ok' ? 'text-emerald-300' : ''}
        >
          {notice.text}
        </p>
      )}

      <VirtualGrid
        store={store}
        rules={rules}
        label={`Grilla de ${file.name}`}
        focus={focus}
        selected={selected}
        onFocusChange={setFocus}
        onActivate={activate}
        onSettle={handleSettle}
        onCellPointerDown={handleCellPointerDown}
      />

      {drag && group && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 rounded bg-white px-2 py-1 text-sm font-semibold text-slate-900"
          style={{ left: drag.x + 12, top: drag.y + 12 }}
        >
          {group.size} celdas
        </div>
      )}
    </main>
  )
}

interface Loaded {
  fileId: number
  file: DataFile | null
  rules: Rules | null
  error: string | null
}

export default function RefinePage() {
  const { id } = useParams()
  const fileId = Number(id)
  const valid = Number.isInteger(fileId) && fileId > 0
  const [reload, setReload] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!valid) return
    const controller = new AbortController()
    const { signal } = controller
    Promise.all([
      withRetry((s) => api<DataFile>(`/files/${fileId}`, { signal: s }), signal),
      withRetry((s) => api<Rules>(`/files/${fileId}/rules`, { signal: s }), signal),
    ]).then(
      ([file, rules]) => setLoaded({ fileId, file, rules, error: null }),
      (error: unknown) => {
        if (signal.aborted) return
        const message =
          error instanceof ApiError && error.status === 404
            ? 'Ese archivo no existe.'
            : error instanceof ApiError
              ? error.message
              : 'No se pudo abrir el archivo.'
        setLoaded({ fileId, file: null, rules: null, error: message })
      },
    )
    return () => controller.abort()
  }, [fileId, valid, reload])

  const current = loaded?.fileId === fileId ? loaded : null

  return (
    <>
      <AppNav />
      {!valid ? (
        <main className="px-4 py-8">
          <p role="alert">Ese archivo no existe.</p>
          <Link to="/files" className="underline">
            Volver a los archivos
          </Link>
        </main>
      ) : current?.error ? (
        <main className="grid gap-2 px-4 py-8">
          <p role="alert" className="text-red-300">
            {current.error}
          </p>
          <button type="button" className="justify-self-start underline" onClick={() => setReload((n) => n + 1)}>
            Reintentar
          </button>
          <Link to="/files" className="underline">
            Volver a los archivos
          </Link>
        </main>
      ) : current?.file && current.rules ? (
        <Refiner key={fileId} initialFile={current.file} rules={current.rules} />
      ) : (
        <main className="px-4 py-8" role="status">
          <p>Abriendo el archivo…</p>
        </main>
      )}
    </>
  )
}
