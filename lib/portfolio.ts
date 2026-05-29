import type { PortfolioRow, PositionRow, SnapshotRow } from './types'

/** Total portfolio value = cash + sum of (shares × current price). */
export function computeTotalValue(
  portfolio: PortfolioRow,
  positions: PositionRow[],
  prices: Record<string, number>
): number {
  const posValue = positions.reduce(
    (sum, p) => sum + p.shares * (prices[p.ticker] ?? p.avg_cost),
    0
  )
  return portfolio.cash_balance + posValue
}

/** Absolute return vs starting capital. */
export function absoluteReturn(
  totalValue: number,
  startingCapital: number
): { dollars: number; percent: number } {
  const dollars = totalValue - startingCapital
  const percent = startingCapital > 0 ? (dollars / startingCapital) * 100 : 0
  return { dollars, percent }
}

/** Compute min/max bounds for chart Y axis with 2% padding. */
export function chartBounds(
  snapshots: SnapshotRow[],
  startingCapital: number
): { min: number; max: number } {
  const values = snapshots.map((s) => s.total_value)
  const allValues = [...values, startingCapital]
  const rawMin = Math.min(...allValues)
  const rawMax = Math.max(...allValues)
  const pad = (rawMax - rawMin) * 0.05 || rawMax * 0.02
  return { min: rawMin - pad, max: rawMax + pad }
}

/** Format a dollar value with compact suffix. */
export function fmtDollars(n: number): string {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}
