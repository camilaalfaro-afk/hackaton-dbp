import { useCallback } from 'react'
import type { KeyboardEvent } from 'react'
import type { BinCode } from '../types/api'

export interface GridPosition {
  r: number
  c: number
}

export interface UseGridKeyboardOptions {
  rows: number
  cols: number
  cursor: GridPosition
  pageStep?: number
  onMoveCursor: (r: number, c: number) => void
  onSelectCell: (r: number, c: number) => void
  onSendToBin: (bin: BinCode) => void
  onClearSelection: () => void
}

const BIN_SHORTCUTS: Readonly<Record<string, BinCode>> = {
  '1': 'WO',
  w: 'WO',
  W: 'WO',
  '2': 'FC',
  f: 'FC',
  F: 'FC',
  '3': 'DR',
  d: 'DR',
  D: 'DR',
  '4': 'MA',
  m: 'MA',
  M: 'MA',
}

export function useGridKeyboard({
  rows,
  cols,
  cursor,
  pageStep = 10,
  onMoveCursor,
  onSelectCell,
  onSendToBin,
  onClearSelection,
}: UseGridKeyboardOptions) {
  const clampRow = useCallback(
    (r: number) => Math.max(0, Math.min(rows - 1, r)),
    [rows],
  )

  const clampCol = useCallback(
    (c: number) => Math.max(0, Math.min(cols - 1, c)),
    [cols],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (rows <= 0 || cols <= 0) return

      const { r, c } = cursor

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault()
          onMoveCursor(clampRow(r - 1), c)
          return
        case 'ArrowDown':
          event.preventDefault()
          onMoveCursor(clampRow(r + 1), c)
          return
        case 'ArrowLeft':
          event.preventDefault()
          onMoveCursor(r, clampCol(c - 1))
          return
        case 'ArrowRight':
          event.preventDefault()
          onMoveCursor(r, clampCol(c + 1))
          return
        case 'PageUp':
          event.preventDefault()
          onMoveCursor(clampRow(r - pageStep), c)
          return
        case 'PageDown':
          event.preventDefault()
          onMoveCursor(clampRow(r + pageStep), c)
          return
        case 'Home':
          event.preventDefault()
          onMoveCursor(event.ctrlKey ? 0 : r, 0)
          return
        case 'End':
          event.preventDefault()
          onMoveCursor(event.ctrlKey ? rows - 1 : r, cols - 1)
          return
        case 'Enter':
        case ' ':
          event.preventDefault()
          onSelectCell(r, c)
          return
        case 'Escape':
          event.preventDefault()
          onClearSelection()
          return
        default: {
          const targetBin = BIN_SHORTCUTS[event.key]
          if (targetBin) {
            event.preventDefault()
            onSendToBin(targetBin)
          }
        }
      }
    },
    [
      rows,
      cols,
      cursor,
      pageStep,
      clampRow,
      clampCol,
      onMoveCursor,
      onSelectCell,
      onSendToBin,
      onClearSelection,
    ],
  )

  return { handleKeyDown }
}