import type { FredSeriesData } from '@/lib/types'

const LABELS: Record<string, string> = {
  GDP: 'GDP',
  UNRATE: 'Unemployment',
  CPIAUCSL: 'CPI',
  FEDFUNDS: 'Fed Funds',
  DGS10: '10Y Treasury',
  T10YIE: 'Breakeven Inflation',
}

const UNITS: Record<string, string> = {
  GDP: 'B',
  UNRATE: '%',
  CPIAUCSL: '',
  FEDFUNDS: '%',
  DGS10: '%',
  T10YIE: '%',
}

interface Props {
  macro: Record<string, FredSeriesData>
}

export default function MacroStrip({ macro }: Props) {
  const items = Object.entries(macro).filter(([, v]) => v?.observations?.length)

  if (items.length === 0) return null

  return (
    <div className="bg-slate-800 rounded-2xl p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
        Macro Environment
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {items.map(([id, series]) => {
          const latest = series.observations[0]
          const prev = series.observations[1]
          const val = parseFloat(latest.value)
          const prevVal = prev ? parseFloat(prev.value) : null
          const delta =
            prevVal !== null && !isNaN(val) && !isNaN(prevVal)
              ? val - prevVal
              : null
          const up = delta !== null ? delta >= 0 : null
          const unit = UNITS[id] ?? ''

          return (
            <div key={id} className="text-center">
              <p className="text-xs text-slate-400 mb-1">
                {LABELS[id] ?? id}
              </p>
              <p className="text-base font-bold tabular-nums text-white">
                {isNaN(val) ? '—' : `${val.toFixed(2)}${unit}`}
              </p>
              {delta !== null && (
                <p
                  className={`text-xs tabular-nums font-medium ${
                    up ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {up ? '+' : ''}
                  {delta.toFixed(2)}
                  {unit}
                </p>
              )}
              <p className="text-xs text-slate-500 mt-0.5">{latest.date}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
