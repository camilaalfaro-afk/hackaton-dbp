import type { BinCode, Rules } from '../types/api'
import { binForDigits, isScary, neighborOffsets, noiseReason } from './rules'
import type { NoiseReason } from './rules'
import type { Cell, CellRef, TileStore } from './tileCache'

export interface Group {
  cells: CellRef[]
  size: number
  /** The bin the rules assign to this group. Null when it is noise. */
  bin: BinCode | null
  noise: NoiseReason | null
  /** Set when the group was already refined. */
  refinedAs: BinCode | null
}

/** What the search needs from the grid. TileStore satisfies it. */
export type CellSource = Pick<TileStore, 'meta' | 'ensureCell'>

/**
 * The complete group that contains (r, c): a breadth-first search over scary neighbours.
 * It crosses tile borders, loading the missing tiles as it reaches them.
 * Resolves with null when the starting cell is not scary.
 */
export async function findGroup(
  source: CellSource,
  rules: Rules,
  r: number,
  c: number,
  signal?: AbortSignal,
): Promise<Group | null> {
  const start = await source.ensureCell(r, c, signal)
  if (!start || !isScary(start.tremor, rules)) return null

  const offsets = neighborOffsets(rules.connectivity)
  const { cols } = source.meta
  const visited = new Set<number>([r * cols + c])
  const queue: Cell[] = [start]
  const members: Cell[] = []

  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head]
    members.push(cell)

    // Bigger than the maximum is noise already: no need to walk the rest of it.
    if (members.length > rules.maxGroupSize) break

    for (const [dr, dc] of offsets) {
      const nr = cell.r + dr
      const nc = cell.c + dc
      if (nr < 0 || nc < 0 || nr >= source.meta.rows || nc >= cols) continue
      const id = nr * cols + nc
      if (visited.has(id)) continue
      visited.add(id)

      const neighbor = await source.ensureCell(nr, nc, signal)
      if (neighbor && isScary(neighbor.tremor, rules)) queue.push(neighbor)
    }
  }

  const noise = noiseReason(members.length, rules)
  return {
    cells: members.map((cell) => ({ r: cell.r, c: cell.c })),
    size: members.length,
    bin: noise ? null : binForDigits(members.map((cell) => cell.value), rules),
    noise,
    refinedAs: start.bin,
  }
}
