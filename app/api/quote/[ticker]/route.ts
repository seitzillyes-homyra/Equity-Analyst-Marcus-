import type { NextRequest } from 'next/server'
import { getQuote, getProfile } from '@/lib/fmp'

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/api/quote/[ticker]'>
) {
  const { ticker } = await ctx.params
  const symbol = ticker.toUpperCase()

  try {
    const [quoteResult, profileResult] = await Promise.allSettled([
      getQuote(symbol),
      getProfile(symbol),
    ])

    if (quoteResult.status === 'rejected') {
      return Response.json(
        { error: `Could not fetch quote for ${symbol}: ${String(quoteResult.reason)}` },
        { status: 404 }
      )
    }

    return Response.json({
      quote: quoteResult.value,
      profile: profileResult.status === 'fulfilled' ? profileResult.value : null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
