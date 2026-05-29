import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { portfolioId, totalValue, cashBalance, positionsValue } = await req.json()

  if (!portfolioId) {
    return Response.json({ error: 'portfolioId required' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await supabase
    .from('portfolio_snapshots')
    .upsert(
      {
        portfolio_id: portfolioId,
        total_value: totalValue,
        cash_balance: cashBalance,
        positions_value: positionsValue,
        snapshot_date: new Date().toISOString().split('T')[0],
      },
      { onConflict: 'portfolio_id,snapshot_date' }
    )
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data)
}
