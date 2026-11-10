import type { BinCode, Progress } from '../types/api'

export interface BinBarProps {
  bin: BinCode | 'overall'
  value: number
}

const names = { WO: 'WO · Woe', FC: 'FC · Frolic', DR: 'DR · Dread', MA: 'MA · Malice', overall: 'Progreso total' }

/** Values from the API are fractions, not percentages. */
export function BinBar({ bin, value }: BinBarProps) {
  const fraction = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
  const percentage = Math.round(fraction * 1000) / 10
  return <div className="grid gap-1">
    <div className="flex justify-between gap-4 text-sm"><span>{names[bin]}</span><span>{percentage}%</span></div>
    <progress aria-label={names[bin]} value={fraction} max={1} className="h-3 w-full accent-sky-400">{percentage}%</progress>
  </div>
}

export function BinBars({ progress }: { progress: Progress }) {
  return <div className="grid gap-3">
    <BinBar bin="overall" value={progress.overall} />
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {(['WO', 'FC', 'DR', 'MA'] as const).map(bin => <BinBar key={bin} bin={bin} value={progress[bin]} />)}
    </div>
  </div>
}
