import type { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import {
  getQuote,
  getProfile,
  getIncomeStatements,
  getBalanceSheets,
  getCashFlows,
  getKeyMetrics,
} from '@/lib/fmp'
import { getMacroSnapshot } from '@/lib/fred'
import { createSupabaseAdmin } from '@/lib/supabase'
import type { AnalyzeRequest, AnalysisData } from '@/lib/types'

const SYSTEM_PROMPT = `You are a senior equity analyst at a top-tier investment bank with 20+ years of experience covering global equities. Your analyses combine rigorous quantitative work with qualitative judgment.

Structure every response with clear ## sections:
## Executive Summary (2-3 sentences — investment thesis and key risk)
## Financial Performance (revenue, margins, earnings quality, trend analysis)
## Balance Sheet & Capital Allocation (leverage, liquidity, FCF, buybacks, dividends)
## Valuation (P/E, EV/EBITDA, P/FCF vs. historical and sector peers)
## Macro Environment (how current rates, inflation, GDP trend affect this business)
## Key Risks (bull case / base case / bear case)
## Conclusion & Recommendation

Be direct. Cite specific numbers. Avoid generic boilerplate. Write at an institutional level.`

export async function POST(req: NextRequest) {
  let body: AnalyzeRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { ticker, query } = body
  if (!ticker || !query) {
    return Response.json(
      { error: '`ticker` and `query` are required' },
      { status: 400 }
    )
  }

  const symbol = ticker.toUpperCase().trim()

  const anthropicKey = process.env.APP_ANTHROPIC_KEY
  if (!anthropicKey) {
    return Response.json({ error: 'APP_ANTHROPIC_KEY is not configured' }, { status: 500 })
  }
  const anthropic = new Anthropic({ apiKey: anthropicKey })

  const supabase = createSupabaseAdmin()

  // ── 1. Check for a recent cached analysis (7 days) ──────────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: cached } = await supabase
    .from('analyses')
    .select('*')
    .eq('ticker', symbol)
    .eq('query', query)
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cached) {
    return Response.json({ ...cached, cached: true })
  }

  // ── 2. Fetch all data in parallel ────────────────────────────────────────
  let analysisData: AnalysisData
  try {
    const [quote, profile, income, balance, cashflow, metrics, macro] =
      await Promise.all([
        getQuote(symbol),
        getProfile(symbol),
        getIncomeStatements(symbol),
        getBalanceSheets(symbol),
        getCashFlows(symbol),
        getKeyMetrics(symbol),
        getMacroSnapshot(),
      ])

    analysisData = { quote, profile, income, balance, cashflow, metrics, macro }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { error: `Data fetch failed: ${message}` },
      { status: 502 }
    )
  }

  // ── 3. Build prompt & call Anthropic ─────────────────────────────────────
  const userMessage = `Analyze **${symbol}** (${analysisData.profile.companyName}) and answer:

> ${query}

---

### Financial Data (JSON)

\`\`\`json
${JSON.stringify(analysisData, null, 2)}
\`\`\`

Provide an institutional-quality analysis using the data above.`

  let analysisText: string
  let model: string
  let tokensUsed: number

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    analysisText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('\n')

    model = response.model
    tokensUsed = response.usage.input_tokens + response.usage.output_tokens
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { error: `Analysis generation failed: ${message}` },
      { status: 502 }
    )
  }

  // ── 4. Persist to Supabase ────────────────────────────────────────────────
  const { data: stored, error: storeErr } = await supabase
    .from('analyses')
    .insert({
      ticker: symbol,
      query,
      data: analysisData as unknown as object,
      analysis: analysisText,
      model,
      tokens_used: tokensUsed,
    })
    .select('id, created_at')
    .single()

  if (storeErr) {
    console.error('[analyze] Failed to store analysis:', storeErr.message)
  }

  return Response.json({
    id: stored?.id ?? null,
    analysis: analysisText,
    data: analysisData,
    model,
    tokens_used: tokensUsed,
    cached: false,
    created_at: stored?.created_at ?? new Date().toISOString(),
  })
}
