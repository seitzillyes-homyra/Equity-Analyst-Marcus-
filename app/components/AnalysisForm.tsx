'use client'

import { useState, useTransition } from 'react'
import type { AnalyzeResponse } from '@/lib/types'
import QuoteHeader from './QuoteHeader'
import FinancialsGrid from './FinancialsGrid'
import MacroStrip from './MacroStrip'
import AnalysisPanel from './AnalysisPanel'

const SUGGESTED_QUERIES = [
  'What is the investment thesis and key risks?',
  'Is the stock overvalued or undervalued at current levels?',
  'How has the capital allocation strategy evolved and what does it mean for shareholders?',
  'How would a rising interest rate environment impact this business?',
]

export default function AnalysisForm() {
  const [ticker, setTicker] = useState('')
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSuggest(q: string) {
    setQuery(q)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!ticker.trim() || !query.trim()) return

    setError(null)
    setResult(null)

    startTransition(async () => {
      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticker: ticker.trim().toUpperCase(),
            query: query.trim(),
          }),
        })

        const json = await res.json()

        if (!res.ok) {
          setError(json.error ?? `Server error (${res.status})`)
          return
        }

        setResult(json as AnalyzeResponse)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error')
      }
    })
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Input card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Ticker */}
          <div>
            <label
              htmlFor="ticker"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Ticker Symbol
            </label>
            <input
              id="ticker"
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL, MSFT, NVDA"
              className="w-full sm:w-48 px-4 py-2.5 rounded-xl border border-gray-300 text-gray-900 font-mono uppercase placeholder:normal-case placeholder:font-sans placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              maxLength={10}
              disabled={isPending}
              required
            />
          </div>

          {/* Query */}
          <div>
            <label
              htmlFor="query"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Analysis Question
            </label>
            <textarea
              id="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What would you like to know about this stock?"
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent resize-none"
              disabled={isPending}
              required
            />
          </div>

          {/* Suggestions */}
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleSuggest(q)}
                className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:border-slate-900 hover:text-slate-900 transition-colors disabled:opacity-40"
                disabled={isPending}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending || !ticker.trim() || !query.trim()}
            className="w-full sm:w-auto px-8 py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isPending ? (
              <>
                <Spinner />
                Analysing…
              </>
            ) : (
              'Analyse →'
            )}
          </button>
        </form>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Loading skeleton */}
      {isPending && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
            <div className="h-6 w-48 bg-gray-200 rounded mb-4" />
            <div className="h-10 w-36 bg-gray-200 rounded mb-2" />
            <div className="grid grid-cols-4 gap-3 mt-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-xl" />
              ))}
            </div>
          </div>
          <div className="bg-slate-800 rounded-2xl p-4 animate-pulse">
            <div className="grid grid-cols-6 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-16 bg-slate-700 rounded-lg" />
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse space-y-3">
            <div className="h-4 w-32 bg-gray-200 rounded" />
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`h-3 bg-gray-100 rounded ${i % 3 === 2 ? 'w-3/4' : 'w-full'}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {result && !isPending && (
        <div className="space-y-4">
          <QuoteHeader quote={result.data.quote} profile={result.data.profile} />
          <MacroStrip macro={result.data.macro} />
          <FinancialsGrid
            income={result.data.income}
            balance={result.data.balance}
            cashflow={result.data.cashflow}
            metrics={result.data.metrics}
          />
          <AnalysisPanel
            analysis={result.analysis}
            model={result.model}
            tokensUsed={result.tokens_used}
            cached={result.cached}
            createdAt={result.created_at}
          />
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
