# Equity Analyst — Phase 2 Update: Paper Trading Dashboard

This document updates the existing codebase built in Phase 1-9. Read the entire file before touching any existing code. Do not delete or overwrite anything already built — only add to it.

---

## What you are adding

A paper trading dashboard powered by an AI wealth manager. The manager has a $1,000 starting budget, a growth-oriented mandate, and covers US and European markets. It runs when the user manually triggers it. Every trade decision is logged with full reasoning. The user can view the dashboard to track performance and copy trades to their real broker.

---

## New Supabase tables

Run this SQL in the Supabase SQL editor. Do not modify the existing `api_cache` and `analyses` tables.

```sql
-- One portfolio per user
create table portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text default 'Growth Portfolio',
  cash_balance numeric not null default 1000.00,
  starting_capital numeric not null default 1000.00,
  created_at timestamptz default now()
);

-- Current open positions
create table positions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid references portfolios(id) on delete cascade,
  ticker text not null,
  company_name text not null,
  shares numeric not null,
  avg_cost numeric not null,
  currency text not null default 'USD',
  opened_at timestamptz default now(),
  unique(portfolio_id, ticker)
);

-- Every trade the AI executes
create table trades (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid references portfolios(id) on delete cascade,
  ticker text not null,
  company_name text not null,
  action text not null check (action in ('BUY', 'SELL')),
  shares numeric not null,
  price numeric not null,
  total_value numeric not null,
  currency text not null default 'USD',
  reasoning text not null,
  executed_at timestamptz default now()
);

-- Daily snapshots for P&L chart
create table portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid references portfolios(id) on delete cascade,
  total_value numeric not null,
  cash_balance numeric not null,
  positions_value numeric not null,
  snapshot_date date not null default current_date,
  unique(portfolio_id, snapshot_date)
);

-- AI wealth manager briefings
create table briefings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid references portfolios(id) on delete cascade,
  content text not null,
  trades_made jsonb not null default '[]',
  total_value_after numeric not null,
  created_at timestamptz default now()
);

-- RLS
alter table portfolios enable row level security;
alter table positions enable row level security;
alter table trades enable row level security;
alter table portfolio_snapshots enable row level security;
alter table briefings enable row level security;

create policy "own portfolio" on portfolios for all using (auth.uid() = user_id);
create policy "own positions" on positions for all using (
  portfolio_id in (select id from portfolios where user_id = auth.uid())
);
create policy "own trades" on trades for all using (
  portfolio_id in (select id from portfolios where user_id = auth.uid())
);
create policy "own snapshots" on portfolio_snapshots for all using (
  portfolio_id in (select id from portfolios where user_id = auth.uid())
);
create policy "own briefings" on briefings for all using (
  portfolio_id in (select id from portfolios where user_id = auth.uid())
);

-- Indexes
create index on trades(portfolio_id, executed_at desc);
create index on portfolio_snapshots(portfolio_id, snapshot_date desc);
create index on briefings(portfolio_id, created_at desc);
```

---

## New TypeScript types

Add these to the existing `lib/types.ts`. Do not remove anything already there.

```typescript
export interface Portfolio {
  id: string
  userId: string
  name: string
  cashBalance: number
  startingCapital: number
  createdAt: string
}

export interface Position {
  id: string
  portfolioId: string
  ticker: string
  companyName: string
  shares: number
  avgCost: number
  currency: string
  openedAt: string
  // computed at runtime, not stored
  currentPrice?: number
  currentValue?: number
  unrealisedPnl?: number
  unrealisedPnlPercent?: number
}

export interface Trade {
  id: string
  portfolioId: string
  ticker: string
  companyName: string
  action: 'BUY' | 'SELL'
  shares: number
  price: number
  totalValue: number
  currency: string
  reasoning: string
  executedAt: string
}

export interface PortfolioSnapshot {
  id: string
  portfolioId: string
  totalValue: number
  cashBalance: number
  positionsValue: number
  snapshotDate: string
}

export interface Briefing {
  id: string
  portfolioId: string
  content: string
  tradesMade: Trade[]
  totalValueAfter: number
  createdAt: string
}

export interface WealthManagerDecision {
  action: 'BUY' | 'SELL' | 'HOLD'
  ticker: string
  companyName: string
  shares: number
  estimatedPrice: number
  reasoning: string
  conviction: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface WealthManagerResponse {
  briefing: string
  decisions: WealthManagerDecision[]
  marketOutlook: string
  watchlist: string[]
}
```

---

## New file structure

Add only these files. Do not touch existing files except where explicitly stated.

```
app/
├── dashboard/
│   └── page.tsx                  ← main trading dashboard
├── dashboard/
│   └── trades/
│       └── page.tsx              ← full trade history
└── api/
    ├── portfolio/
    │   └── route.ts              ← GET portfolio + positions with live prices
    ├── manager/
    │   └── route.ts              ← POST trigger AI wealth manager run
    └── snapshot/
        └── route.ts              ← POST save daily snapshot

lib/
├── manager.ts                    ← AI wealth manager logic
├── manager-prompt.ts             ← wealth manager system prompt
└── portfolio.ts                  ← portfolio calculation helpers
```

---

## Wealth manager prompt

Create `lib/manager-prompt.ts`. This is the most important file in the update.

```typescript
import type { Position, Trade, MacroData } from './types'

export function buildWealthManagerPrompt(params: {
  cashBalance: number
  startingCapital: number
  positions: Position[]
  recentTrades: Trade[]
  macro: MacroData
  positionPrices: Record<string, number>
}): string {
  const { cashBalance, startingCapital, positions, recentTrades, macro, positionPrices } = params

  const totalPositionsValue = positions.reduce((sum, p) => {
    return sum + p.shares * (positionPrices[p.ticker] ?? p.avgCost)
  }, 0)
  const totalValue = cashBalance + totalPositionsValue
  const totalReturn = ((totalValue - startingCapital) / startingCapital * 100).toFixed(2)

  const positionsText = positions.length === 0
    ? 'No open positions. Portfolio is 100% cash.'
    : positions.map(p => {
        const currentPrice = positionPrices[p.ticker] ?? p.avgCost
        const currentValue = p.shares * currentPrice
        const pnl = ((currentPrice - p.avgCost) / p.avgCost * 100).toFixed(2)
        return `- ${p.ticker} (${p.companyName}): ${p.shares} shares @ avg $${p.avgCost.toFixed(2)} | Current: $${currentPrice.toFixed(2)} | Value: $${currentValue.toFixed(2)} | P&L: ${pnl}%`
      }).join('\n')

  const recentTradesText = recentTrades.length === 0
    ? 'No previous trades.'
    : recentTrades.slice(0, 5).map(t =>
        `- ${t.action} ${t.shares} ${t.ticker} @ $${t.price.toFixed(2)} on ${new Date(t.executedAt).toLocaleDateString()}`
      ).join('\n')

  return `You are Marcus Webb, a senior wealth manager with 25 years of experience at a top-tier private bank. You manage a growth-oriented portfolio for a young investor. Your mandate:

INVESTMENT MANDATE:
- Style: Growth investing — focus on companies with strong earnings growth, expanding margins, and secular tailwinds
- Universe: US and European equities (NYSE, NASDAQ, major European exchanges)
- Risk: Moderate-high. You are willing to be concentrated but never put more than 25% in a single position
- Cash: Always keep minimum 10% cash as dry powder. Never go below this.
- Position sizing: Typical position is 15-25% of total portfolio value. Max 5 open positions at once.
- Bias: Long only. No shorting, no leverage, no options.

CURRENT PORTFOLIO STATE:
- Starting Capital: $${startingCapital.toFixed(2)}
- Current Total Value: $${totalValue.toFixed(2)}
- Cash Available: $${cashBalance.toFixed(2)} (${((cashBalance / totalValue) * 100).toFixed(1)}% of portfolio)
- Total Return: ${totalReturn}%

OPEN POSITIONS:
${positionsText}

RECENT TRADE HISTORY:
${recentTradesText}

CURRENT MACRO ENVIRONMENT:
- Fed Funds Rate: ${macro.fedFundsRate}%
- Inflation (CPI): ${macro.cpi}%
- 10-Year Treasury: ${macro.tenYearYield}%
- Unemployment: ${macro.unemploymentRate}%
- GDP Growth: ${macro.realGDPGrowth}%

YOUR TASK:
Review the portfolio and decide what actions to take today. You must respond with valid JSON only — no markdown, no preamble, no explanation outside the JSON structure.

Respond with exactly this JSON structure:
{
  "briefing": "A 3-4 paragraph written briefing in your voice as Marcus Webb. Cover: (1) your read on current market conditions, (2) what you did today and why, (3) what you are watching. Write like you are presenting to your client at a quarterly review. Be specific, reference real market dynamics, and justify every decision.",
  "marketOutlook": "One sentence summary of your current market view",
  "decisions": [
    {
      "action": "BUY or SELL",
      "ticker": "exact ticker symbol",
      "companyName": "full company name",
      "shares": number_of_shares_as_integer,
      "estimatedPrice": estimated_current_price_as_number,
      "reasoning": "2-3 sentence explanation of this specific trade",
      "conviction": "HIGH or MEDIUM or LOW"
    }
  ],
  "watchlist": ["TICKER1", "TICKER2"]
}

RULES FOR DECISIONS:
- decisions array can be empty [] if you decide to hold everything
- For BUY: shares × estimatedPrice must not exceed available cash minus 10% cash reserve
- For SELL: shares must not exceed current position size
- estimatedPrice should be your best estimate of current fair market price
- Only recommend trades you have HIGH or MEDIUM conviction on
- Think carefully before trading — transaction costs matter even in paper trading
- If portfolio is new with only cash, make 2-3 initial positions to deploy capital

Respond with JSON only. No text before or after the JSON.`
}
```

---

## Wealth manager engine

Create `lib/manager.ts`.

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { buildWealthManagerPrompt } from './manager-prompt'
import { fetchMacroData } from './data'
import type { Portfolio, Position, Trade, WealthManagerResponse, WealthManagerDecision } from './types'

const anthropic = new Anthropic()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function runWealthManager(portfolioId: string): Promise<{
  briefing: string
  tradesExecuted: Trade[]
  totalValueAfter: number
  error?: string
}> {
  // 1. Load portfolio
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', portfolioId)
    .single()

  if (!portfolio) throw new Error('Portfolio not found')

  // 2. Load positions
  const { data: positions } = await supabase
    .from('positions')
    .select('*')
    .eq('portfolio_id', portfolioId)

  // 3. Load recent trades
  const { data: recentTrades } = await supabase
    .from('trades')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('executed_at', { ascending: false })
    .limit(10)

  // 4. Fetch live prices for current positions
  const positionPrices: Record<string, number> = {}
  if (positions && positions.length > 0) {
    await Promise.all(
      positions.map(async (p: Position) => {
        try {
          const res = await fetch(
            `https://financialmodelingprep.com/api/v3/quote/${p.ticker}?apikey=${process.env.FMP_API_KEY}`
          )
          const data = await res.json()
          if (data[0]?.price) positionPrices[p.ticker] = data[0].price
        } catch {
          positionPrices[p.ticker] = p.avgCost
        }
      })
    )
  }

  // 5. Fetch macro data
  const macro = await fetchMacroData()

  // 6. Build prompt and call Claude
  const prompt = buildWealthManagerPrompt({
    cashBalance: portfolio.cash_balance,
    startingCapital: portfolio.starting_capital,
    positions: positions ?? [],
    recentTrades: recentTrades ?? [],
    macro,
    positionPrices
  })

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    system: 'You are Marcus Webb, a senior wealth manager. Always respond with valid JSON only.',
    messages: [{ role: 'user', content: prompt }]
  })

  const textBlock = message.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No response from AI')

  // 7. Parse response
  let managerResponse: WealthManagerResponse
  try {
    const cleaned = textBlock.text.replace(/```json|```/g, '').trim()
    managerResponse = JSON.parse(cleaned)
  } catch {
    throw new Error('AI returned invalid JSON')
  }

  // 8. Execute trades
  const tradesExecuted: Trade[] = []
  let currentCash = portfolio.cash_balance

  for (const decision of managerResponse.decisions) {
    if (decision.action === 'BUY') {
      const totalCost = decision.shares * decision.estimatedPrice
      const minCash = (portfolio.cash_balance + (positions ?? []).reduce((s: number, p: Position) =>
        s + p.shares * (positionPrices[p.ticker] ?? p.avgCost), 0)) * 0.10

      if (currentCash - totalCost < minCash) continue

      // Fetch real current price
      let actualPrice = decision.estimatedPrice
      try {
        const res = await fetch(
          `https://financialmodelingprep.com/api/v3/quote/${decision.ticker}?apikey=${process.env.FMP_API_KEY}`
        )
        const data = await res.json()
        if (data[0]?.price) actualPrice = data[0].price
      } catch { }

      const actualTotal = decision.shares * actualPrice

      // Check existing position
      const existing = positions?.find((p: Position) => p.ticker === decision.ticker)

      if (existing) {
        const newShares = existing.shares + decision.shares
        const newAvgCost = ((existing.shares * existing.avg_cost) + actualTotal) / newShares
        await supabase.from('positions').update({
          shares: newShares,
          avg_cost: newAvgCost
        }).eq('id', existing.id)
      } else {
        await supabase.from('positions').insert({
          portfolio_id: portfolioId,
          ticker: decision.ticker,
          company_name: decision.companyName,
          shares: decision.shares,
          avg_cost: actualPrice,
          currency: 'USD'
        })
      }

      currentCash -= actualTotal

      const trade = {
        portfolio_id: portfolioId,
        ticker: decision.ticker,
        company_name: decision.companyName,
        action: 'BUY' as const,
        shares: decision.shares,
        price: actualPrice,
        total_value: actualTotal,
        currency: 'USD',
        reasoning: decision.reasoning
      }

      const { data: insertedTrade } = await supabase.from('trades').insert(trade).select().single()
      if (insertedTrade) tradesExecuted.push(insertedTrade)
    }

    if (decision.action === 'SELL') {
      const position = positions?.find((p: Position) => p.ticker === decision.ticker)
      if (!position || position.shares < decision.shares) continue

      let actualPrice = decision.estimatedPrice
      try {
        const res = await fetch(
          `https://financialmodelingprep.com/api/v3/quote/${decision.ticker}?apikey=${process.env.FMP_API_KEY}`
        )
        const data = await res.json()
        if (data[0]?.price) actualPrice = data[0].price
      } catch { }

      const actualTotal = decision.shares * actualPrice
      const newShares = position.shares - decision.shares

      if (newShares === 0) {
        await supabase.from('positions').delete().eq('id', position.id)
      } else {
        await supabase.from('positions').update({ shares: newShares }).eq('id', position.id)
      }

      currentCash += actualTotal

      const trade = {
        portfolio_id: portfolioId,
        ticker: decision.ticker,
        company_name: decision.companyName,
        action: 'SELL' as const,
        shares: decision.shares,
        price: actualPrice,
        total_value: actualTotal,
        currency: 'USD',
        reasoning: decision.reasoning
      }

      const { data: insertedTrade } = await supabase.from('trades').insert(trade).select().single()
      if (insertedTrade) tradesExecuted.push(insertedTrade)
    }
  }

  // 9. Update cash balance
  await supabase.from('portfolios').update({ cash_balance: currentCash }).eq('id', portfolioId)

  // 10. Compute total value after trades
  const { data: updatedPositions } = await supabase
    .from('positions').select('*').eq('portfolio_id', portfolioId)

  const positionsValueAfter = (updatedPositions ?? []).reduce((sum: number, p: Position) => {
    return sum + p.shares * (positionPrices[p.ticker] ?? p.avg_cost)
  }, 0)
  const totalValueAfter = currentCash + positionsValueAfter

  // 11. Save briefing
  await supabase.from('briefings').insert({
    portfolio_id: portfolioId,
    content: managerResponse.briefing,
    trades_made: tradesExecuted,
    total_value_after: totalValueAfter
  })

  // 12. Save snapshot
  await supabase.from('portfolio_snapshots').upsert({
    portfolio_id: portfolioId,
    total_value: totalValueAfter,
    cash_balance: currentCash,
    positions_value: positionsValueAfter,
    snapshot_date: new Date().toISOString().split('T')[0]
  }, { onConflict: 'portfolio_id,snapshot_date' })

  return {
    briefing: managerResponse.briefing,
    tradesExecuted,
    totalValueAfter
  }
}
```

---

## New API routes

### `app/api/portfolio/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  // Get or create portfolio
  let { data: portfolio } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!portfolio) {
    const { data: newPortfolio } = await supabase
      .from('portfolios')
      .insert({ user_id: userId })
      .select()
      .single()
    portfolio = newPortfolio
  }

  // Get positions
  const { data: positions } = await supabase
    .from('positions')
    .select('*')
    .eq('portfolio_id', portfolio.id)

  // Get live prices for positions
  const enrichedPositions = await Promise.all(
    (positions ?? []).map(async (p: any) => {
      try {
        const res = await fetch(
          `https://financialmodelingprep.com/api/v3/quote/${p.ticker}?apikey=${process.env.FMP_API_KEY}`
        )
        const data = await res.json()
        const currentPrice = data[0]?.price ?? p.avg_cost
        const currentValue = p.shares * currentPrice
        const unrealisedPnl = currentValue - p.shares * p.avg_cost
        const unrealisedPnlPercent = ((currentPrice - p.avg_cost) / p.avg_cost) * 100
        return { ...p, currentPrice, currentValue, unrealisedPnl, unrealisedPnlPercent }
      } catch {
        return { ...p, currentPrice: p.avg_cost, currentValue: p.shares * p.avg_cost, unrealisedPnl: 0, unrealisedPnlPercent: 0 }
      }
    })
  )

  // Get snapshots for chart
  const { data: snapshots } = await supabase
    .from('portfolio_snapshots')
    .select('*')
    .eq('portfolio_id', portfolio.id)
    .order('snapshot_date', { ascending: true })
    .limit(90)

  // Get recent trades
  const { data: trades } = await supabase
    .from('trades')
    .select('*')
    .eq('portfolio_id', portfolio.id)
    .order('executed_at', { ascending: false })
    .limit(20)

  // Get latest briefing
  const { data: briefings } = await supabase
    .from('briefings')
    .select('*')
    .eq('portfolio_id', portfolio.id)
    .order('created_at', { ascending: false })
    .limit(1)

  const positionsValue = enrichedPositions.reduce((s: number, p: any) => s + p.currentValue, 0)
  const totalValue = portfolio.cash_balance + positionsValue

  return NextResponse.json({
    portfolio: { ...portfolio, totalValue, positionsValue },
    positions: enrichedPositions,
    snapshots: snapshots ?? [],
    trades: trades ?? [],
    latestBriefing: briefings?.[0] ?? null
  })
}
```

### `app/api/manager/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { runWealthManager } from '@/lib/manager'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { portfolioId } = await req.json()
  if (!portfolioId) return NextResponse.json({ error: 'portfolioId required' }, { status: 400 })

  try {
    const result = await runWealthManager(portfolioId)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Manager run failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

---

## Dashboard page

Create `app/dashboard/page.tsx`. This is a client component (`'use client'`).

The dashboard has four sections laid out as a single page:

### Section 1 — Portfolio header bar
- Portfolio name ("Growth Portfolio")
- Total value in large text (e.g. "$1,024.50")
- Return vs starting capital in green/red (e.g. "+$24.50 / +2.45%")
- Cash available
- "Run Wealth Manager" button — triggers POST to `/api/manager`, shows a loading spinner while running, then refreshes all data

### Section 2 — Performance chart
- Line chart showing portfolio total value over time using the `snapshots` data
- X axis: dates, Y axis: dollar value
- Show starting capital as a flat dashed reference line
- Use a simple HTML canvas chart — do NOT install recharts or any charting library
- Implement the chart using the Canvas 2D API directly in a `useEffect`

### Section 3 — Current positions table
Columns: Ticker | Company | Shares | Avg Cost | Current Price | Value | P&L ($) | P&L (%) | Action

- P&L column is green if positive, red if negative
- "Copy Trade" button in the Action column — clicking it opens a modal that says: "To copy this position, buy [X] shares of [TICKER] at market price on your broker. Current price: $[PRICE]"

### Section 4 — Two columns side by side

**Left — Latest PM Briefing**
- Show the most recent briefing text from Marcus Webb
- Show the date it was generated
- If no briefing yet, show "Run the Wealth Manager to get your first briefing"

**Right — Recent Trades log**
- List of last 10 trades
- Each row: date | BUY/SELL badge | ticker | shares | price | total | "Copy" button
- BUY badge is green, SELL badge is red
- "Copy" button shows the same copy trade modal

### Data fetching
On mount, fetch from `/api/portfolio?userId={userId}`. Get userId from Supabase auth session. Refresh every 60 seconds automatically using `setInterval`.

### Loading state
Show a skeleton loader (gray animated pulse blocks) while data is loading. Do not show any numbers until data is confirmed loaded.

---

## Trade history page

Create `app/dashboard/trades/page.tsx`.

Full paginated trade history table with columns:
Date | Time | Action | Ticker | Company | Shares | Price | Total Value | Reasoning

- Reasoning column is truncated to 80 chars with a "Read more" expand
- Filter buttons at top: All | BUY | SELL
- Pagination: 20 trades per page
- Export button: downloads all trades as CSV

---

## Navigation update

Add a "Dashboard" link to the existing navigation in `app/layout.tsx`. Place it next to the existing nav items. Route: `/dashboard`.

---

## Build order for this update

Execute in exactly this order:

1. Run the new SQL in Supabase
2. Add new types to `lib/types.ts`
3. Create `lib/manager-prompt.ts`
4. Create `lib/manager.ts`
5. Create `app/api/portfolio/route.ts` — test with curl
6. Create `app/api/manager/route.ts`
7. Create `app/dashboard/page.tsx`
8. Create `app/dashboard/trades/page.tsx`
9. Update `app/layout.tsx` navigation

Verify step 5 before proceeding: `curl "localhost:3000/api/portfolio?userId=test"` should return a portfolio object with empty positions.

---

## What not to add

- Do not install recharts, chart.js, d3, or any charting library — use Canvas API
- Do not add real money integration of any kind
- Do not add a broker API connection
- Do not add automated scheduling — the manager only runs when the user clicks the button
- Do not add short selling or leverage logic
- Do not modify the existing stock analysis pages

---

## Verification checklist

- [ ] Dashboard loads with $1,000 starting balance for new user
- [ ] "Run Wealth Manager" button triggers AI and shows loading state
- [ ] After first run, 2-3 positions appear in the positions table
- [ ] Trades appear in the trade log with full reasoning
- [ ] Briefing text from Marcus Webb appears in the briefing panel
- [ ] P&L shows correctly (green positive, red negative)
- [ ] Performance chart shows at least one data point after first run
- [ ] Copy trade modal opens with correct share count and price
- [ ] Trade history page shows all trades with filter and pagination
- [ ] Running manager a second time updates positions correctly
- [ ] Cash balance never drops below 10% of total portfolio value
