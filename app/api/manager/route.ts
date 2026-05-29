import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runWealthManager } from '@/lib/manager'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  let portfolioId: string
  try {
    const body = await req.json()
    portfolioId = body.portfolioId
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!portfolioId) {
    return Response.json({ error: 'portfolioId required' }, { status: 400 })
  }

  // Count today's briefings — allow max 2 runs per calendar day
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(new Date(today).getTime() + 86_400_000).toISOString().split('T')[0]
  const { count: todayCount } = await supabase
    .from('briefings')
    .select('*', { count: 'exact', head: true })
    .eq('portfolio_id', portfolioId)
    .gte('created_at', today)
    .lt('created_at', tomorrow)

  if ((todayCount ?? 0) >= 2) {
    return Response.json(
      { error: 'Both sessions complete for today. Come back tomorrow.' },
      { status: 429 }
    )
  }

  try {
    const result = await runWealthManager(portfolioId)
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Manager run failed'
    console.error('[manager]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
