import { createSupabaseAdmin } from './supabase'

/** TTL values in seconds */
export const CACHE_TTL = {
  quote: 5 * 60,            // 5 min — price data (FMP free tier: 250 calls/day)
  financials: 24 * 60 * 60, // 24 h  — quarterly filings
  fred: 60 * 60,            // 1 h   — monthly/quarterly macro
  analysis: 7 * 24 * 60 * 60, // 7 d — AI analysis
} as const

export async function getCache<T>(key: string): Promise<T | null> {
  const supabase = createSupabaseAdmin()

  const { data, error } = await supabase
    .from('api_cache')
    .select('data, expires_at')
    .eq('cache_key', key)
    .single()

  if (error || !data) return null
  if (new Date(data.expires_at) < new Date()) return null

  return data.data as T
}

export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  const supabase = createSupabaseAdmin()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)

  await supabase.from('api_cache').upsert(
    {
      cache_key: key,
      data: value as object,
      fetched_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: 'cache_key' }
  )
}
