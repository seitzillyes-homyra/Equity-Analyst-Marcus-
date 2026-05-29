'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { TradeRow } from '@/lib/types'

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt2(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncate(text: string, max: number) {
  return text.length <= max ? text : text.slice(0, max) + '…'
}

// ─── types ────────────────────────────────────────────────────────────────────

type FilterType = 'ALL' | 'BUY' | 'SELL'

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-100 rounded-lg" />
      ))}
    </div>
  )
}

// ─── Reasoning cell ───────────────────────────────────────────────────────────

function ReasoningCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const short = truncate(text, 80)
  const needsExpand = text.length > 80

  return (
    <td className="py-3 pl-4 text-xs text-gray-600 max-w-xs">
      <span>{expanded ? text : short}</span>
      {needsExpand && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-1 text-slate-500 hover:text-slate-900 font-medium underline underline-offset-2 whitespace-nowrap"
        >
          {expanded ? 'Collapse' : 'Read more'}
        </button>
      )}
    </td>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TradesPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [trades, setTrades] = useState<TradeRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<FilterType>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const perPage = 20
  const totalPages = Math.max(1, Math.ceil(total / perPage))

  // Load user id from localStorage
  useEffect(() => {
    let id = localStorage.getItem('ea_user_id')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('ea_user_id', id)
    }
    setUserId(id)
  }, [])

  const fetchTrades = useCallback(
    async (uid: string, pg: number, f: FilterType) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ userId: uid, page: String(pg) })
        if (f !== 'ALL') params.set('filter', f)
        const res = await fetch(`/api/trades?${params}`)
        if (!res.ok) throw new Error(await res.text())
        const json = await res.json()
        setTrades(json.trades ?? [])
        setTotal(json.total ?? 0)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load trades')
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (!userId) return
    fetchTrades(userId, page, filter)
  }, [userId, page, filter, fetchTrades])

  // Reset to page 1 when filter changes
  function changeFilter(f: FilterType) {
    setFilter(f)
    setPage(1)
  }

  // CSV export — fetch ALL trades (no pagination) and download
  async function exportCSV() {
    if (!userId || exporting) return
    setExporting(true)
    try {
      // Fetch all pages
      const allTrades: TradeRow[] = []
      let pg = 1
      while (true) {
        const params = new URLSearchParams({ userId, page: String(pg), perPage: '200' })
        const res = await fetch(`/api/trades?${params}`)
        const json = await res.json()
        allTrades.push(...(json.trades ?? []))
        if (allTrades.length >= json.total || (json.trades ?? []).length === 0) break
        pg++
      }

      const header = 'Date,Time,Action,Ticker,Company,Shares,Price,Total Value,Currency,Reasoning'
      const rows = allTrades.map((t) => [
        fmtDate(t.executed_at),
        fmtTime(t.executed_at),
        t.action,
        t.ticker,
        `"${t.company_name.replace(/"/g, '""')}"`,
        t.shares,
        t.price.toFixed(2),
        t.total_value.toFixed(2),
        t.currency,
        `"${t.reasoning.replace(/"/g, '""')}"`,
      ].join(','))

      const csv = [header, ...rows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `trades-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <Link
            href="/dashboard"
            className="text-xs text-gray-400 hover:text-gray-700 font-medium mb-1 inline-block"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Trade History</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total.toLocaleString()} trade{total !== 1 ? 's' : ''} in total
          </p>
        </div>

        <button
          onClick={exportCSV}
          disabled={exporting || total === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {exporting ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Exporting…
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </>
          )}
        </button>
      </div>

      {/* ── Filter buttons ──────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-5">
        {(['ALL', 'BUY', 'SELL'] as const).map((f) => (
          <button
            key={f}
            onClick={() => changeFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              filter === f
                ? f === 'BUY'
                  ? 'bg-emerald-600 text-white'
                  : f === 'SELL'
                  ? 'bg-red-500 text-white'
                  : 'bg-slate-900 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-5">
          {error}
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-6">
            <TableSkeleton />
          </div>
        ) : trades.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            {filter === 'ALL'
              ? 'No trades yet. Run the Wealth Manager from the dashboard to make your first trades.'
              : `No ${filter} trades found.`}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {[
                    { label: 'Date', cls: 'pl-6 pr-4' },
                    { label: 'Time', cls: 'pr-4' },
                    { label: 'Action', cls: 'pr-4' },
                    { label: 'Ticker', cls: 'pr-4' },
                    { label: 'Company', cls: 'pr-4' },
                    { label: 'Shares', cls: 'text-right pr-4' },
                    { label: 'Price', cls: 'text-right pr-4' },
                    { label: 'Total Value', cls: 'text-right pr-6' },
                    { label: 'Reasoning', cls: 'pl-4 pr-4' },
                  ].map(({ label, cls }) => (
                    <th
                      key={label}
                      className={`py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${cls}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {trades.map((t) => {
                  const isBuy = t.action === 'BUY'
                  return (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 pl-6 pr-4 text-xs text-gray-500 whitespace-nowrap">
                        {fmtDate(t.executed_at)}
                      </td>
                      <td className="py-3 pr-4 text-xs text-gray-400 whitespace-nowrap">
                        {fmtTime(t.executed_at)}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${
                            isBuy
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {t.action}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono font-semibold text-gray-900">
                        {t.ticker}
                      </td>
                      <td className="py-3 pr-4 text-gray-600 max-w-[160px] truncate">
                        {t.company_name}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-gray-700">
                        {t.shares}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-gray-700">
                        ${fmt2(t.price)}
                      </td>
                      <td className="py-3 pr-6 text-right tabular-nums font-medium text-gray-900">
                        ${fmt2(t.total_value)}
                      </td>
                      <ReasoningCell text={t.reasoning} />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-5">
          <p className="text-xs text-gray-400">
            Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of{' '}
            {total.toLocaleString()} trades
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-700 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Previous
            </button>
            <span className="px-4 py-2 text-sm text-gray-500">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-700 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
