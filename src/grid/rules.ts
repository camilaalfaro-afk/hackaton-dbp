import type { BinCode, Rules } from '../types/api'

// Pure functions: no network, no state. Every value comes from the file's rules.

const BIN_BY_CHAR: Record<string, BinCode> = { W: 'WO', F: 'FC', D: 'DR', M: 'MA' }
const CHAR_BY_BIN: Record<BinCode, string> = { WO: 'W', FC: 'F', DR: 'D', MA: 'M' }

/** Tile `bins` char to bin code. "." (unrefined) gives null. */
export function binFromChar(char: string): BinCode | null {
  return BIN_BY_CHAR[char] ?? null
}

export function charFromBin(bin: BinCode): string {
  return CHAR_BY_BIN[bin]
}

export function isScary(tremor: number, rules: Rules): boolean {
  return tremor >= rules.tremorThreshold
}

type Offset = readonly [dr: number, dc: number]

const ORTHOGONAL: readonly Offset[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]
const DIAGONAL: readonly Offset[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]

/** Neighbours of a cell: 4 (sides) or 8 (sides and diagonals). */
export function neighborOffsets(connectivity: Rules['connectivity']): readonly Offset[] {
  return connectivity === 8 ? [...ORTHOGONAL, ...DIAGONAL] : ORTHOGONAL
}

/** The bin a group belongs to, from the digits of all its cells. */
export function binForDigits(digits: readonly number[], rules: Rules): BinCode | null {
  if (digits.length === 0) return null
  const { strategy, order } = rules.binning
  const base =
    strategy === 'DIGIT_SUM_MOD'
      ? digits.reduce((sum, digit) => sum + digit, 0)
      : Math.max(...digits)
  return order[base % 4] ?? null
}

export type NoiseReason = 'TOO_SMALL' | 'TOO_LARGE'

/** A group outside [minGroupSize, maxGroupSize] is noise and cannot be refined. */
export function noiseReason(size: number, rules: Rules): NoiseReason | null {
  if (size < rules.minGroupSize) return 'TOO_SMALL'
  if (size > rules.maxGroupSize) return 'TOO_LARGE'
  return null
}
