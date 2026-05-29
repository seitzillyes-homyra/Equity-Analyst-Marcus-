import type {
  FmpIncomeStatement,
  FmpBalanceSheet,
  FmpCashFlow,
  FmpKeyMetrics,
} from '@/lib/types'

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n as number)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(0)}M`
  return n.toFixed(2)
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n as number)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-base font-bold tabular-nums text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

interface Props {
  income: FmpIncomeStatement[]
  balance: FmpBalanceSheet[]
  cashflow: FmpCashFlow[]
  metrics: FmpKeyMetrics[]
}

export default function FinancialsGrid({
  income,
  balance,
  cashflow,
  metrics,
}: Props) {
  const i = income[0]
  const b = balance[0]
  const c = cashflow[0]
  const m = metrics[0]

  if (!i && !b && !c && !m) return null

  const grossMargin = i
    ? i.grossProfit / i.revenue
    : null
  const opMargin = i ? i.operatingIncome / i.revenue : null
  const netMargin = i ? i.netIncome / i.revenue : null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
        Financials{i ? ` — FY${i.fiscalYear}` : ''}
      </h3>

      {/* Income */}
      {i && (
        <div className="mb-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            Income Statement
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Revenue" value={`$${fmtNum(i.revenue)}`} />
            <StatCard
              label="Gross Profit"
              value={`$${fmtNum(i.grossProfit)}`}
              sub={grossMargin !== null ? fmtPct(grossMargin) : undefined}
            />
            <StatCard
              label="Operating Income"
              value={`$${fmtNum(i.operatingIncome)}`}
              sub={opMargin !== null ? fmtPct(opMargin) : undefined}
            />
            <StatCard
              label="Net Income"
              value={`$${fmtNum(i.netIncome)}`}
              sub={netMargin !== null ? fmtPct(netMargin) : undefined}
            />
          </div>
        </div>
      )}

      {/* Balance sheet */}
      {b && (
        <div className="mb-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            Balance Sheet
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Cash & ST Investments"
              value={`$${fmtNum(b.cashAndShortTermInvestments)}`}
            />
            <StatCard label="Total Assets" value={`$${fmtNum(b.totalAssets)}`} />
            <StatCard label="Total Debt" value={`$${fmtNum(b.totalDebt)}`} />
            <StatCard label="Net Debt" value={`$${fmtNum(b.netDebt)}`} />
          </div>
        </div>
      )}

      {/* Cash flow */}
      {c && (
        <div className="mb-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            Cash Flow
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Operating CF"
              value={`$${fmtNum(c.operatingCashFlow)}`}
            />
            <StatCard
              label="Capex"
              value={`$${fmtNum(Math.abs(c.capitalExpenditure))}`}
            />
            <StatCard label="Free Cash Flow" value={`$${fmtNum(c.freeCashFlow)}`} />
            <StatCard
              label="Buybacks"
              value={
                c.commonStockRepurchased
                  ? `$${fmtNum(Math.abs(c.commonStockRepurchased))}`
                  : '—'
              }
            />
          </div>
        </div>
      )}

      {/* Key metrics / valuation */}
      {m && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            Valuation & Returns
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="EV/EBITDA"
              value={m.evToEBITDA ? m.evToEBITDA.toFixed(1) + 'x' : '—'}
            />
            <StatCard
              label="EV/Sales"
              value={m.evToSales ? m.evToSales.toFixed(1) + 'x' : '—'}
            />
            <StatCard
              label="ROE"
              value={m.returnOnEquity ? fmtPct(m.returnOnEquity) : '—'}
            />
            <StatCard
              label="ROIC"
              value={
                m.returnOnInvestedCapital
                  ? fmtPct(m.returnOnInvestedCapital)
                  : '—'
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}
