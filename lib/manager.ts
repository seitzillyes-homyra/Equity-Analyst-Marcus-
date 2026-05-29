import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import {
  buildWealthManagerSystemPrompt,
  buildDailyResearchPrompt,
  buildTradingDecisionPrompt,
} from './manager-prompt'
import { fetchMacroData } from './data'
import type {
  Trade,
  WealthManagerResponse,
  PortfolioRow,
  PositionRow,
  TradeRow,
} from './types'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function fetchVerifiedFundamentals(fmpKey: string): Promise<string> {
  type ScreenerItem = {
    symbol: string
    companyName?: string
    price?: number
    revenueGrowth?: number  // FMP returns as decimal ratio, e.g. 0.20 = 20%
  }
  type QuoteItem = {
    symbol: string
    price?: number
    yearHigh?: number
  }
  type Row = {
    ticker: string
    revenueGrowthPct: number | null
    currentPrice: number | null
    weekHigh52: number | null
    pctOf52wHigh: number | null
  }

  // Step 1: screener — FMP pre-filters by revenue growth > 15%
  const screenerRes = await fetch(
    `https://financialmodelingprep.com/api/v3/stock-screener?marketCapMoreThan=10000000000&revenueGrowthMoreThan=15&exchange=NASDAQ,NYSE,EURONEXT&limit=50&apikey=${fmpKey}`,
    { cache: 'no-store' }
  )
  if (!screenerRes.ok) throw new Error(`Screener fetch failed: ${screenerRes.status}`)
  const screenerData: ScreenerItem[] = await screenerRes.json()
  if (!Array.isArray(screenerData) || screenerData.length === 0) {
    return 'No stocks matched the screener criteria (market cap >$10B, revenue growth >15%).'
  }

  // Step 2: batch quote for all tickers — single API call for price + 52W high
  const tickerList = screenerData.map(s => s.symbol).join(',')
  const quotesRes = await fetch(
    `https://financialmodelingprep.com/api/v3/quote/${tickerList}?apikey=${fmpKey}`,
    { cache: 'no-store' }
  )
  const quotesData: QuoteItem[] = quotesRes.ok ? await quotesRes.json() : []
  const quoteMap = new Map<string, QuoteItem>(
    Array.isArray(quotesData) ? quotesData.map(q => [q.symbol, q]) : []
  )

  // Step 3: merge screener + quote data
  const rows: Row[] = screenerData.map(s => {
    const quote = quoteMap.get(s.symbol)
    const currentPrice = quote?.price ?? s.price ?? null
    const weekHigh52 = quote?.yearHigh ?? null
    const pctOf52wHigh =
      currentPrice != null && weekHigh52 != null && weekHigh52 > 0
        ? (currentPrice / weekHigh52) * 100
        : null
    // FMP stores revenueGrowth as a decimal ratio (0.20 = 20%)
    const revenueGrowthPct = s.revenueGrowth != null ? s.revenueGrowth * 100 : null
    return { ticker: s.symbol, revenueGrowthPct, currentPrice, weekHigh52, pctOf52wHigh }
  })

  const fmt = (n: number | null, prefix = '', suffix = '', decimals = 1) =>
    n != null ? `${prefix}${n.toFixed(decimals)}${suffix}` : 'N/A'

  const lines = [
    'Ticker | Rev Growth YoY | Price    | 52W High | % of High | Entry Criteria',
    '-------|----------------|----------|----------|-----------|---------------',
    ...rows.map(r => {
      // All rows passed the screener's >15% revenue filter
      const growth = r.revenueGrowthPct != null
        ? `${r.revenueGrowthPct >= 0 ? '+' : ''}${r.revenueGrowthPct.toFixed(1)}%`
        : '>15%'
      const nearHighPass = r.pctOf52wHigh != null && r.pctOf52wHigh >= 80
      const criteria = nearHighPass ? 'PASS (both)' : 'Rev ✓  High ✗'
      return `${r.ticker.padEnd(6)} | ${growth.padEnd(14)} | ${fmt(r.currentPrice, '$', '', 2).padEnd(8)} | ${fmt(r.weekHigh52, '$', '', 2).padEnd(8)} | ${fmt(r.pctOf52wHigh, '', '%').padEnd(9)} | ${criteria}`
    }),
  ]

  return lines.join('\n')
}

/** Fetch current price from Yahoo Finance chart API (no key, no rate limit). */
async function livePrice(ticker: string, fallback: number): Promise<number> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, cache: 'no-store' }
    )
    if (!res.ok) return fallback
    const json = await res.json()
    const price: number | undefined = json?.chart?.result?.[0]?.meta?.regularMarketPrice
    return price ?? fallback
  } catch {
    return fallback
  }
}

async function getDayNumber(
  portfolioId: string,
  supabase: ReturnType<typeof getSupabase>
): Promise<number> {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase
    .from('portfolio_snapshots')
    .select('snapshot_date')
    .eq('portfolio_id', portfolioId)
    .neq('snapshot_date', today)
  const distinctDates = new Set((data ?? []).map(r => r.snapshot_date))
  return distinctDates.size + 1
}

export async function runWealthManager(portfolioId: string): Promise<{
  researchReport: string
  briefing: string
  tradesExecuted: Trade[]
  totalValueAfter: number
  dayNumber: number
  decisionsReceived: number
  skipped: number
}> {
  const supabase = getSupabase()

  const anthropicKey = process.env.APP_ANTHROPIC_KEY
  if (!anthropicKey) throw new Error('APP_ANTHROPIC_KEY is not configured')
  const anthropic = new Anthropic({ apiKey: anthropicKey, maxRetries: 0 })

  // 0a. Guard: skip on non-trading days
  const fmpKey = process.env.FMP_API_KEY
  if (fmpKey) {
    let marketOpen = true
    try {
      const marketRes = await fetch(
        `https://financialmodelingprep.com/api/v3/is-the-market-open?apikey=${fmpKey}`,
        { cache: 'no-store' }
      )
      if (marketRes.ok) {
        const marketJson = await marketRes.json()
        if (marketJson?.isTheStockMarketOpen === false) {
          marketOpen = false
        }
      }
    } catch {
      console.warn('[manager] market hours check failed, proceeding anyway')
    }
    if (!marketOpen) {
      throw new Error('US market is closed today — no trades will be made. Check back on the next trading day.')
    }
  }

  // 1. Load portfolio
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', portfolioId)
    .single<PortfolioRow>()

  if (!portfolio) throw new Error('Portfolio not found')

  // 2. Load positions and recent trades
  const { data: positionsData } = await supabase
    .from('positions')
    .select('*')
    .eq('portfolio_id', portfolioId)

  const { data: recentTradesData } = await supabase
    .from('trades')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('executed_at', { ascending: false })
    .limit(10)

  const positionRows: PositionRow[] = positionsData ?? []
  const recentTrades: TradeRow[] = recentTradesData ?? []

  // 3. Fetch macro data and day number
  const [macro, dayNumber] = await Promise.all([
    fetchMacroData(),
    getDayNumber(portfolioId, supabase),
  ])
  console.log('[manager] Day number:', dayNumber)

  // 4. Fetch live prices for current positions
  const positionPrices: Record<string, number> = {}
  await Promise.all(
    positionRows.map(async (p) => {
      positionPrices[p.ticker] = await livePrice(p.ticker, p.avg_cost)
    })
  )

  // 5. Fetch verified fundamentals from FMP for the watchlist universe
  let verifiedFundamentals = ''
  if (fmpKey) {
    try {
      verifiedFundamentals = await fetchVerifiedFundamentals(fmpKey)
    } catch (err) {
      console.warn('[manager] fundamentals fetch failed:', err instanceof Error ? err.message : err)
    }
  }

  const systemPrompt = buildWealthManagerSystemPrompt()

  // ── STEP 1: Daily research with web search enabled ────────────────────────
  let researchReport = ''
  try {
    const researchMessage = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      system: systemPrompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ type: 'web_search_20250305', name: 'web_search' }] as any,
      messages: [{
        role: 'user',
        content: buildDailyResearchPrompt(macro, dayNumber, verifiedFundamentals),
      }],
    }, { timeout: 90_000 })

    researchReport = researchMessage.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('\n')
      .trim()

    if (!researchReport) researchReport = 'Research completed. Proceeding to trading decisions.'
  } catch (err) {
    console.error('[manager] research phase error:', err)
    researchReport = 'Web search unavailable today. Proceeding with available market data.'
  }

  // Brief pause to let the token-per-minute bucket partially refill
  await new Promise((r) => setTimeout(r, 5000))

  // Cap research report at 1500 chars so the trading prompt stays lean
  const researchReportTrimmed = researchReport.slice(0, 1500)

  // ── STEP 2: Trading decisions based on research ───────────────────────────
  let decisionMessage: Awaited<ReturnType<typeof anthropic.messages.create>>
  try {
    decisionMessage = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      system: 'You are Marcus Webb, a senior wealth manager. Always respond with valid JSON only.',
      messages: [{
        role: 'user',
        content: buildTradingDecisionPrompt({
          cashBalance: portfolio.cash_balance,
          startingCapital: portfolio.starting_capital,
          positions: positionRows,
          recentTrades,
          macro,
          positionPrices,
          researchReport: researchReportTrimmed,
          dayNumber,
        }),
      }],
    }, { timeout: 60_000 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('429') || msg.includes('rate_limit')) {
      throw new Error('Anthropic rate limit hit — please wait a few minutes and try again.')
    }
    throw new Error(`Trading decision failed: ${msg.slice(0, 200)}`)
  }

  const textBlock = decisionMessage.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No response from AI')

  let managerResponse: WealthManagerResponse
  try {
    const cleaned = textBlock.text.replace(/```json|```/g, '').trim()
    managerResponse = JSON.parse(cleaned)
  } catch {
    throw new Error(`AI returned invalid JSON: ${textBlock.text.slice(0, 200)}`)
  }
  console.log(`[manager] decisions received: ${(managerResponse.decisions ?? []).length}`, JSON.stringify(managerResponse.decisions ?? []))

  // ── Execute trades ────────────────────────────────────────────────────────
  const tradesExecuted: Trade[] = []
  let currentCash = portfolio.cash_balance

  const totalPortfolioValue =
    portfolio.cash_balance +
    positionRows.reduce((s, p) => s + p.shares * (positionPrices[p.ticker] ?? p.avg_cost), 0)
  const minCashFloor = totalPortfolioValue * 0.15  // 15% cash minimum

  // Track open position count for the 5-position limit
  let openPositionCount = positionRows.length

  for (const decision of (managerResponse.decisions ?? [])) {
    // ── BUY ─────────────────────────────────────────────────────────────────
    if (decision.action === 'BUY') {
      const actualPrice = await livePrice(decision.ticker, decision.estimatedPrice)
      const actualTotal = decision.shares * actualPrice
      const cashAfter = currentCash - actualTotal

      if (cashAfter < minCashFloor) { console.log(`[manager] SKIP ${decision.ticker}: cash floor — cashAfter $${cashAfter.toFixed(2)} < floor $${minCashFloor.toFixed(2)}`); continue }
      if (actualTotal > totalPortfolioValue * 0.25) { console.log(`[manager] SKIP ${decision.ticker}: 25% cap — trade $${actualTotal.toFixed(2)} > cap $${(totalPortfolioValue * 0.25).toFixed(2)}`); continue }

      const existing = positionRows.find((p) => p.ticker === decision.ticker)

      if (!existing) {
        // Enforce max 5 open positions
        if (openPositionCount >= 5) { console.log(`[manager] SKIP ${decision.ticker}: max 5 positions reached`); continue }

        const { error: posErr } = await supabase.from('positions').insert({
          portfolio_id: portfolioId,
          ticker: decision.ticker,
          company_name: decision.companyName,
          shares: decision.shares,
          avg_cost: actualPrice,
          currency: 'USD',
        })
        if (posErr) { console.error('[manager] position insert error:', posErr); continue }
        openPositionCount++
      } else {
        const newShares = existing.shares + decision.shares
        const newAvgCost = (existing.shares * existing.avg_cost + actualTotal) / newShares
        const { error: posErr } = await supabase
          .from('positions')
          .update({ shares: newShares, avg_cost: newAvgCost })
          .eq('id', existing.id)
        if (posErr) { console.error('[manager] position update error:', posErr); continue }
      }

      currentCash -= actualTotal

      const { data: inserted, error: tradeErr } = await supabase
        .from('trades')
        .insert({
          portfolio_id: portfolioId,
          ticker: decision.ticker,
          company_name: decision.companyName,
          action: 'BUY',
          shares: decision.shares,
          price: actualPrice,
          total_value: actualTotal,
          currency: 'USD',
          reasoning: decision.reasoning,
        })
        .select()
        .single<TradeRow>()

      if (tradeErr) {
        console.error('[manager] trade insert error:', tradeErr)
      } else if (inserted) {
        tradesExecuted.push({
          id: inserted.id,
          portfolioId: inserted.portfolio_id,
          ticker: inserted.ticker,
          companyName: inserted.company_name,
          action: inserted.action,
          shares: inserted.shares,
          price: inserted.price,
          totalValue: inserted.total_value,
          currency: inserted.currency,
          reasoning: inserted.reasoning,
          executedAt: inserted.executed_at,
        })
      }
    }

    // ── SELL ─────────────────────────────────────────────────────────────────
    if (decision.action === 'SELL') {
      const position = positionRows.find((p) => p.ticker === decision.ticker)
      if (!position || position.shares < decision.shares) continue

      const actualPrice = await livePrice(decision.ticker, decision.estimatedPrice)
      const actualTotal = decision.shares * actualPrice
      const newShares = position.shares - decision.shares

      if (newShares === 0) {
        const { error: posErr } = await supabase.from('positions').delete().eq('id', position.id)
        if (posErr) { console.error('[manager] position delete error:', posErr); continue }
        openPositionCount--
      } else {
        const { error: posErr } = await supabase
          .from('positions')
          .update({ shares: newShares })
          .eq('id', position.id)
        if (posErr) { console.error('[manager] position update error:', posErr); continue }
      }

      currentCash += actualTotal

      const { data: inserted, error: tradeErr } = await supabase
        .from('trades')
        .insert({
          portfolio_id: portfolioId,
          ticker: decision.ticker,
          company_name: decision.companyName,
          action: 'SELL',
          shares: decision.shares,
          price: actualPrice,
          total_value: actualTotal,
          currency: 'USD',
          reasoning: decision.reasoning,
        })
        .select()
        .single<TradeRow>()

      if (tradeErr) {
        console.error('[manager] trade insert error:', tradeErr)
      } else if (inserted) {
        tradesExecuted.push({
          id: inserted.id,
          portfolioId: inserted.portfolio_id,
          ticker: inserted.ticker,
          companyName: inserted.company_name,
          action: inserted.action,
          shares: inserted.shares,
          price: inserted.price,
          totalValue: inserted.total_value,
          currency: inserted.currency,
          reasoning: inserted.reasoning,
          executedAt: inserted.executed_at,
        })
      }
    }
  }

  // 9. Update cash balance
  await supabase
    .from('portfolios')
    .update({ cash_balance: currentCash })
    .eq('id', portfolioId)

  // 10. Recompute total value after trades
  const { data: updatedPositions } = await supabase
    .from('positions')
    .select('*')
    .eq('portfolio_id', portfolioId)

  const positionsValueAfter = (updatedPositions ?? []).reduce(
    (sum: number, p: PositionRow) =>
      sum + p.shares * (positionPrices[p.ticker] ?? p.avg_cost),
    0
  )
  const totalValueAfter = currentCash + positionsValueAfter

  // 11. Save briefing (includes research report)
  const fullBriefingContent = `## Day ${dayNumber}/30 — Morning Research\n\n${researchReport}\n\n---\n\n## Trading Decisions\n\n${managerResponse.briefing}\n\n**Market Outlook:** ${managerResponse.marketOutlook}\n\n**Strategy Compliance:** ${managerResponse.strategyCompliance ?? ''}\n\n**Challenge Note:** ${managerResponse.challengeNote ?? ''}`

  await supabase.from('briefings').insert({
    portfolio_id: portfolioId,
    content: fullBriefingContent,
    trades_made: tradesExecuted,
    total_value_after: totalValueAfter,
    watchlist: managerResponse.watchlist ?? [],
  })

  // 12. Upsert daily snapshot
  await supabase.from('portfolio_snapshots').upsert(
    {
      portfolio_id: portfolioId,
      total_value: totalValueAfter,
      cash_balance: currentCash,
      positions_value: positionsValueAfter,
      snapshot_date: new Date().toISOString().split('T')[0],
    },
    { onConflict: 'portfolio_id,snapshot_date' }
  )

  const decisionsReceived = (managerResponse.decisions ?? []).length
  const skipped = decisionsReceived - tradesExecuted.length
  console.log(`[manager] day=${dayNumber} decisions=${decisionsReceived} executed=${tradesExecuted.length} skipped=${skipped} cash=${currentCash.toFixed(2)}`)

  return {
    researchReport,
    briefing: managerResponse.briefing,
    tradesExecuted,
    totalValueAfter,
    dayNumber,
    decisionsReceived,
    skipped,
  }
}
