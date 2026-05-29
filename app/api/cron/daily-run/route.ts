import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runWealthManager } from '@/lib/manager'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: portfolios, error } = await supabase
    .from('portfolios')
    .select('id, user_id, name')

  if (error || !portfolios) {
    return NextResponse.json({ error: 'Failed to load portfolios' }, { status: 500 })
  }

  const results = []

  for (const portfolio of portfolios) {
    try {
      // Check how many days have already run
      const { count } = await supabase
        .from('briefings')
        .select('*', { count: 'exact', head: true })
        .eq('portfolio_id', portfolio.id)

      const dayNumber = (count ?? 0) + 1

      // Stop after 30 days
      if (dayNumber > 30) {
        results.push({ portfolioId: portfolio.id, status: 'skipped', reason: '30-day challenge complete' })
        continue
      }

      // Skip if already ran today
      const today = new Date().toISOString().split('T')[0]
      const { data: todaySnapshot } = await supabase
        .from('portfolio_snapshots')
        .select('id')
        .eq('portfolio_id', portfolio.id)
        .eq('snapshot_date', today)
        .single()

      if (todaySnapshot) {
        results.push({ portfolioId: portfolio.id, status: 'skipped', reason: 'Already ran today' })
        continue
      }

      const result = await runWealthManager(portfolio.id)
      results.push({
        portfolioId: portfolio.id,
        status: 'success',
        dayNumber: result.dayNumber,
        tradesExecuted: result.tradesExecuted.length,
        totalValueAfter: result.totalValueAfter,
      })
    } catch (err) {
      results.push({
        portfolioId: portfolio.id,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return NextResponse.json({
    ran: new Date().toISOString(),
    portfoliosProcessed: portfolios.length,
    results,
  })
}
