import type { NextRequest } from 'next/server'
import { getMacroSnapshot, getFredSeries } from '@/lib/fred'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const series = searchParams.get('series')

  try {
    if (series) {
      const limitParam = searchParams.get('limit')
      const limit = limitParam ? parseInt(limitParam, 10) : 8
      const data = await getFredSeries(series.toUpperCase(), limit)
      return Response.json(data)
    }

    const snapshot = await getMacroSnapshot()
    return Response.json(snapshot)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
