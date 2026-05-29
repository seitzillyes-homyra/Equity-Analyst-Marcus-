import { getCache, setCache, CACHE_TTL } from './cache'
import type { FredSeries, FredSeriesData, FredObservation } from './types'

const FRED_BASE = 'https://api.stlouisfed.org/fred'

/** Core macro series used in every equity analysis */
export const MACRO_SERIES_IDS = [
  'GDP',        // Gross Domestic Product (quarterly, $B)
  'UNRATE',     // Unemployment Rate (monthly, %)
  'CPIAUCSL',   // CPI All Urban Consumers (monthly, index)
  'FEDFUNDS',   // Federal Funds Effective Rate (monthly, %)
  'DGS10',      // 10-Year Treasury Rate (daily, %)
  'T10YIE',     // 10-Year Breakeven Inflation Rate (daily, %)
] as const

export type MacroSeriesId = (typeof MACRO_SERIES_IDS)[number]

export async function getFredSeries(
  seriesId: string,
  limit = 8
): Promise<FredSeriesData> {
  const key = `fred:${seriesId}:${limit}`
  const cached = await getCache<FredSeriesData>(key)
  if (cached) return cached

  const apiKey = process.env.FRED_API_KEY
  if (!apiKey) throw new Error('FRED_API_KEY is not set')

  const base = `${FRED_BASE}`
  const [seriesRes, obsRes] = await Promise.all([
    fetch(
      `${base}/series?series_id=${seriesId}&api_key=${apiKey}&file_type=json`,
      { cache: 'no-store' }
    ),
    fetch(
      `${base}/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`,
      { cache: 'no-store' }
    ),
  ])

  if (!seriesRes.ok) {
    throw new Error(`FRED series API error ${seriesRes.status} for ${seriesId}`)
  }
  if (!obsRes.ok) {
    throw new Error(
      `FRED observations API error ${obsRes.status} for ${seriesId}`
    )
  }

  const seriesJson = await seriesRes.json()
  const obsJson = await obsRes.json()

  const series: FredSeries = seriesJson.seriess?.[0]
  if (!series) throw new Error(`No FRED series found for ${seriesId}`)

  const observations: FredObservation[] = (obsJson.observations ?? []).filter(
    (o: FredObservation) => o.value !== '.'
  )

  const result: FredSeriesData = { series, observations }
  await setCache(key, result, CACHE_TTL.fred)
  return result
}

/** Fetch all core macro series in parallel (with per-series caching). */
export async function getMacroSnapshot(): Promise<
  Record<MacroSeriesId, FredSeriesData>
> {
  const results = await Promise.allSettled(
    MACRO_SERIES_IDS.map((id) => getFredSeries(id, 4))
  )

  return Object.fromEntries(
    MACRO_SERIES_IDS.map((id, i) => {
      const r = results[i]
      return [id, r.status === 'fulfilled' ? r.value : null]
    }).filter(([, v]) => v !== null)
  ) as Record<MacroSeriesId, FredSeriesData>
}
