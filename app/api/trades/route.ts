import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { TradeRow } from '@/lib/types'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  const filterParam = url.searchParams.get('filter') // 'BUY' | 'SELL' | null
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const perPage = 20
  const offset = (page - 1) * perPage
  const actionFilter = filterParam === 'BUY' || filterParam === 'SELL' ? filterParam : null

  if (!userId) {
    return Response.json({ error: 'userId required' }, { status: 400 })
  }

  const supabase = getSupabase()

  // Resolve portfolio id
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (!portfolio) {
    return Response.json({ trades: [], total: 0, page, perPage })
  }

  // Count total (respecting action filter)
  const countBase = supabase
    .from('trades')
    .select('id', { count: 'exact', head: true })
    .eq('portfolio_id', portfolio.id)

  const { count } = await (actionFilter ? countBase.eq('action', actionFilter) : countBase)

  // Paginated rows
  const baseQuery = supabase
    .from('trades')
    .select('*')
    .eq('portfolio_id', portfolio.id)
    .order('executed_at', { ascending: false })

  const filteredQuery = actionFilter ? baseQuery.eq('action', actionFilter) : baseQuery

  const { data: trades, error } = await filteredQuery
    .range(offset, offset + perPage - 1)
    .returns<TradeRow[]>()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({
    trades: trades ?? [],
    total: count ?? 0,
    page,
    perPage,
  })
}
