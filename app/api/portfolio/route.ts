import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { PositionRow, PortfolioRow, SnapshotRow, TradeRow, BriefingRow } from '@/lib/types'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const userId = new URL(req.url).searchParams.get('userId')
  if (!userId) {
    return Response.json({ error: 'userId required' }, { status: 400 })
  }

  const supabase = getSupabase()

  // ── Get or create portfolio ───────────────────────────────────────────────
  // Single-user mode: if this userId has no portfolio, reuse whichever portfolio
  // already exists rather than creating a new ghost portfolio per browser session.
  let portfolio: PortfolioRow | null = null

  const { data: existing } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', userId)
    .single<PortfolioRow>()

  if (existing) {
    portfolio = existing
  } else {
    // Check if ANY portfolio already exists (single-user mode)
    const { data: anyPortfolio } = await supabase
      .from('portfolios')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single<PortfolioRow>()

    if (anyPortfolio) {
      // Claim the existing portfolio for this browser session
      portfolio = anyPortfolio
    } else {
      // First ever run — create the portfolio
      const { data: created, error: createError } = await supabase
        .from('portfolios')
        .insert({ user_id: userId, name: 'Growth Portfolio' })
        .select()
        .single<PortfolioRow>()
      if (createError) {
        console.error('[portfolio] insert error:', createError)
        return Response.json(
          { error: `Could not create portfolio: ${createError.message}` },
          { status: 500 }
        )
      }
      portfolio = created
    }
  }

  if (!portfolio) {
    return Response.json({ error: 'Could not load or create portfolio' }, { status: 500 })
  }

  // ── Positions with live prices ────────────────────────────────────────────
  const { data: rawPositions } = await supabase
    .from('positions')
    .select('*')
    .eq('portfolio_id', portfolio.id)

  const positionRows: PositionRow[] = rawPositions ?? []

  // Fetch live prices from Yahoo Finance chart API (no API key, no rate limit)
  const livePrices: Record<string, number> = {}
  if (positionRows.length > 0) {
    await Promise.all(
      positionRows.map(async (p) => {
        try {
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${p.ticker}?interval=1d&range=1d`,
            {
              headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
              cache: 'no-store',
              signal: AbortSignal.timeout(5000),
            }
          )
          if (res.ok) {
            const json = await res.json()
            const price: number | undefined = json?.chart?.result?.[0]?.meta?.regularMarketPrice
            if (price != null) livePrices[p.ticker] = price
          }
        } catch (e) {
          console.error(`[portfolio] Yahoo price failed for ${p.ticker}:`, e instanceof Error ? e.message : e)
        }
      })
    )
  }

  const enrichedPositions = positionRows.map((p) => {
    const currentPrice = livePrices[p.ticker] ?? p.avg_cost
    const currentValue = p.shares * currentPrice
    const unrealisedPnl = currentValue - p.shares * p.avg_cost
    const unrealisedPnlPercent = p.avg_cost > 0
      ? ((currentPrice - p.avg_cost) / p.avg_cost) * 100
      : 0
    return {
      ...p,
      currentPrice,
      currentValue,
      unrealisedPnl,
      unrealisedPnlPercent,
    }
  })

  // ── Snapshots (last 90 days) ──────────────────────────────────────────────
  const { data: snapshots } = await supabase
    .from('portfolio_snapshots')
    .select('*')
    .eq('portfolio_id', portfolio.id)
    .order('snapshot_date', { ascending: true })
    .limit(90)
    .returns<SnapshotRow[]>()

  // ── Recent trades ─────────────────────────────────────────────────────────
  const { data: trades } = await supabase
    .from('trades')
    .select('*')
    .eq('portfolio_id', portfolio.id)
    .order('executed_at', { ascending: false })
    .limit(20)
    .returns<TradeRow[]>()

  // ── Latest briefing ───────────────────────────────────────────────────────
  const { data: briefings } = await supabase
    .from('briefings')
    .select('*')
    .eq('portfolio_id', portfolio.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .returns<BriefingRow[]>()

  // ── Briefings count (for 30-day challenge day counter) ────────────────────
  const { count: briefingsCount } = await supabase
    .from('briefings')
    .select('*', { count: 'exact', head: true })
    .eq('portfolio_id', portfolio.id)

  const positionsValue = enrichedPositions.reduce((s, p) => s + p.currentValue, 0)
  const totalValue = portfolio.cash_balance + positionsValue

  return Response.json({
    portfolio: { ...portfolio, totalValue, positionsValue },
    positions: enrichedPositions,
    snapshots: snapshots ?? [],
    trades: trades ?? [],
    latestBriefing: briefings?.[0] ?? null,
    briefingsCount: briefingsCount ?? 0,
  })
}
