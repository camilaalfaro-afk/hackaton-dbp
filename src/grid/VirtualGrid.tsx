import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent, ReactNode, UIEvent } from 'react'
import type { BinCode, Rules } from '../types/api'
import { isScary } from './rules'
import type { CellRef, TileStore } from './tileCache'

export const CELL = 28
// The window never renders more than MAX_ROWS x MAX_COLS = 2 400 cells, plus the focused one.
const MAX_ROWS = 40
const MAX_COLS = 60
const OVERSCAN = 1

const BIN_CLASS: Record<BinCode, string> = {
  WO: 'bg-sky-800 text-sky-50',
  FC: 'bg-amber-700 text-amber-50',
  DR: 'bg-rose-800 text-rose-50',
  MA: 'bg-emerald-800 text-emerald-50',
}

interface VirtualGridProps {
  store: TileStore
  rules: Rules
  label: string
  focus: CellRef
  /** Ids (r * cols + c) of the cells of the selected group. */
  selected: ReadonlySet<number>
  onFocusChange: (cell: CellRef) => void
  onActivate: (cell: CellRef) => void
  /** Top-left visible cell, once the scroll stops. */
  onSettle: (cell: CellRef) => void
  onCellPointerDown: (cell: CellRef, event: PointerEvent<HTMLDivElement>) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function cellFrom(target: EventTarget): CellRef | null {
  if (!(target instanceof Element)) return null
  const id = target.closest('[data-cell]')?.getAttribute('data-cell')
  if (!id) return null
  const [r, c] = id.split(':').map(Number)
  return { r, c }
}

export function VirtualGrid({
  store,
  rules,
  label,
  focus,
  selected,
  onFocusChange,
  onActivate,
  onSettle,
  onCellPointerDown,
}: VirtualGridProps) {
  const { rows, cols, tileSize } = store.meta
  const containerRef = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [scroll, setScroll] = useState(() => ({ top: focus.r * CELL, left: focus.c * CELL }))
  const [size, setSize] = useState({ width: 0, height: 0 })

  // Re-render when a tile arrives or a cell is refined.
  useSyncExternalStore(store.subscribe, store.getVersion)

  // Only the rows and columns in view exist in the DOM.
  const rowCount = Math.min(MAX_ROWS, (size.height ? Math.ceil(size.height / CELL) : 20) + OVERSCAN * 2)
  const colCount = Math.min(MAX_COLS, (size.width ? Math.ceil(size.width / CELL) : 30) + OVERSCAN * 2)
  const firstRow = clamp(Math.floor(scroll.top / CELL) - OVERSCAN, 0, Math.max(0, rows - rowCount))
  const firstCol = clamp(Math.floor(scroll.left / CELL) - OVERSCAN, 0, Math.max(0, cols - colCount))
  const lastRow = Math.min(rows - 1, firstRow + rowCount - 1)
  const lastCol = Math.min(cols - 1, firstCol + colCount - 1)

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return
    // Open at the position the URL asked for.
    element.scrollTop = scroll.top
    element.scrollLeft = scroll.left
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight })
    })
    observer.observe(element)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial position only
  }, [])

  useEffect(() => {
    store.setViewport({ rowStart: firstRow, rowEnd: lastRow, colStart: firstCol, colEnd: lastCol })
  }, [store, firstRow, lastRow, firstCol, lastCol])

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      clearTimeout(settleTimer.current)
    },
    [],
  )

  // Keep the focused cell in view and move the real DOM focus to it.
  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const top = focus.r * CELL
    const left = focus.c * CELL
    if (top < element.scrollTop) element.scrollTop = top
    else if (top + CELL > element.scrollTop + element.clientHeight) {
      element.scrollTop = top + CELL - element.clientHeight
    }
    if (left < element.scrollLeft) element.scrollLeft = left
    else if (left + CELL > element.scrollLeft + element.clientWidth) {
      element.scrollLeft = left + CELL - element.clientWidth
    }
    if (element.contains(document.activeElement)) {
      element
        .querySelector<HTMLElement>(`[data-cell="${focus.r}:${focus.c}"]`)
        ?.focus({ preventScroll: true })
    }
  }, [focus.r, focus.c])

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      setScroll({ top: element.scrollTop, left: element.scrollLeft })
    })
    clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      onSettle({
        r: clamp(Math.floor(element.scrollTop / CELL), 0, rows - 1),
        c: clamp(Math.floor(element.scrollLeft / CELL), 0, cols - 1),
      })
    }, 300)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const page = Math.max(1, Math.floor((size.height || CELL * 10) / CELL) - 1)
    let { r, c } = focus
    switch (event.key) {
      case 'ArrowUp':
        r -= 1
        break
      case 'ArrowDown':
        r += 1
        break
      case 'ArrowLeft':
        c -= 1
        break
      case 'ArrowRight':
        c += 1
        break
      case 'PageUp':
        r -= page
        break
      case 'PageDown':
        r += page
        break
      case 'Home':
        c = 0
        if (event.ctrlKey) r = 0
        break
      case 'End':
        c = cols - 1
        if (event.ctrlKey) r = rows - 1
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        onActivate(focus)
        return
      default:
        return
    }
    event.preventDefault()
    onFocusChange({ r: clamp(r, 0, rows - 1), c: clamp(c, 0, cols - 1) })
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const cell = cellFrom(event.target)
    if (!cell) return
    onFocusChange(cell)
    onActivate(cell)
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const cell = cellFrom(event.target)
    if (cell) onCellPointerDown(cell, event)
  }

  function renderCell(r: number, c: number): ReactNode {
    const cell = store.getCell(r, c)
    const focused = r === focus.r && c === focus.c
    const isSelected = selected.has(r * cols + c)
    const scary = cell !== null && cell.bin === null && isScary(cell.tremor, rules)

    let tone = 'bg-slate-800/60'
    let description = 'cargando'
    if (cell?.bin) {
      tone = BIN_CLASS[cell.bin]
      description = `valor ${cell.value}, refinada en ${cell.bin}`
    } else if (scary) {
      tone = 'cell-scary bg-slate-700 font-bold text-white'
      description = `valor ${cell.value}, da miedo`
    } else if (cell) {
      tone = 'text-slate-400'
      description = `valor ${cell.value}`
    }

    const style: CSSProperties = { left: c * CELL, width: CELL, height: CELL }
    if (scary) {
      // Stronger tremor shakes further.
      const amplitude = 0.6 + ((cell.tremor - rules.tremorThreshold) / 100) * 2.4
      Object.assign(style, { '--amp': `${amplitude.toFixed(2)}px` })
    }

    return (
      <div
        key={c}
        role="gridcell"
        aria-colindex={c + 1}
        aria-selected={isSelected}
        aria-label={`Fila ${r + 1}, columna ${c + 1}, ${description}`}
        data-cell={`${r}:${c}`}
        tabIndex={focused ? 0 : -1}
        style={style}
        className={`absolute top-0 grid place-items-center font-mono text-xs select-none focus:outline-2 focus:outline-sky-300 ${tone} ${
          isSelected ? 'z-10 touch-none ring-2 ring-white' : ''
        }`}
      >
        {cell ? cell.value : ''}
      </div>
    )
  }

  const rowElements: ReactNode[] = []
  for (let r = firstRow; r <= lastRow; r += 1) {
    const cells: ReactNode[] = []
    for (let c = firstCol; c <= lastCol; c += 1) cells.push(renderCell(r, c))
    // The focused cell stays in the DOM even when it is scrolled out of the window.
    if (r === focus.r && (focus.c < firstCol || focus.c > lastCol)) cells.push(renderCell(r, focus.c))
    rowElements.push(
      <div key={r} role="row" aria-rowindex={r + 1} className="absolute left-0" style={{ top: r * CELL, height: CELL }}>
        {cells}
      </div>,
    )
  }
  if (focus.r < firstRow || focus.r > lastRow) {
    rowElements.push(
      <div
        key={focus.r}
        role="row"
        aria-rowindex={focus.r + 1}
        className="absolute left-0"
        style={{ top: focus.r * CELL, height: CELL }}
      >
        {renderCell(focus.r, focus.c)}
      </div>,
    )
  }

  let failedTiles = 0
  for (let tr = Math.floor(firstRow / tileSize); tr <= Math.floor(lastRow / tileSize); tr += 1) {
    for (let tc = Math.floor(firstCol / tileSize); tc <= Math.floor(lastCol / tileSize); tc += 1) {
      if (store.tileState(tr, tc) === 'error') failedTiles += 1
    }
  }
  const paused = store.pauseRemaining() > 0

  return (
    <div className="grid gap-2">
      <div
        ref={containerRef}
        role="grid"
        aria-label={label}
        aria-rowcount={rows}
        aria-colcount={cols}
        aria-multiselectable="true"
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        className="overflow-auto rounded border border-slate-700 bg-slate-950"
        style={{ height: `min(60vh, ${(MAX_ROWS - OVERSCAN * 2) * CELL}px)`, maxWidth: (MAX_COLS - OVERSCAN * 2) * CELL }}
      >
        <div role="rowgroup" className="relative" style={{ width: cols * CELL, height: rows * CELL }}>
          {rowElements}
        </div>
      </div>

      <p role="status" aria-live="polite" className="min-h-6 text-sm text-slate-300">
        {paused && 'Lumon pidió esperar antes de enviar más bloques. '}
        {failedTiles > 0 && (
          <>
            {failedTiles} bloques no cargaron.{' '}
            <button
              type="button"
              className="underline"
              onClick={() =>
                store.setViewport({ rowStart: firstRow, rowEnd: lastRow, colStart: firstCol, colEnd: lastCol })
              }
            >
              Reintentar
            </button>
          </>
        )}
      </p>
    </div>
  )
}
