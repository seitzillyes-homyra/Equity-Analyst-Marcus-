import { getCache, setCache, CACHE_TTL } from './cache'
import type {
  FmpQuote,
  FmpProfile,
  FmpIncomeStatement,
  FmpBalanceSheet,
  FmpCashFlow,
  FmpKeyMetrics,
} from './types'

const FMP_BASE = 'https://financialmodelingprep.com/stable'

async function fmpFetch<T>(path: string): Promise<T> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) throw new Error('FMP_API_KEY is not set')

  const sep = path.includes('?') ? '&' : '?'
  const url = `${FMP_BASE}/${path}${sep}apikey=${apiKey}`

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`FMP ${res.status} for ${path}: ${body.slice(0, 120)}`)
  }

  const json = await res.json()

  // FMP error envelope
  if (json && typeof json === 'object' && !Array.isArray(json) && 'Error Message' in json) {
    throw new Error(`FMP error: ${(json as Record<string, string>)['Error Message']}`)
  }

  return json as T
}

export async function getQuote(ticker: string): Promise<FmpQuote> {
  const symbol = ticker.toUpperCase()
  const key = `fmp:quote:${symbol}`
  const cached = await getCache<FmpQuote>(key)
  if (cached) return cached

  const data = await fmpFetch<FmpQuote[]>(`quote?symbol=${symbol}`)
  if (!data || data.length === 0) throw new Error(`No quote data for ${symbol}`)

  await setCache(key, data[0], CACHE_TTL.quote)
  return data[0]
}

export async function getProfile(ticker: string): Promise<FmpProfile> {
  const symbol = ticker.toUpperCase()
  const key = `fmp:profile:${symbol}`
  const cached = await getCache<FmpProfile>(key)
  if (cached) return cached

  const data = await fmpFetch<FmpProfile[]>(`profile?symbol=${symbol}`)
  if (!data || data.length === 0) throw new Error(`No profile data for ${symbol}`)

  await setCache(key, data[0], CACHE_TTL.quote)
  return data[0]
}

export async function getIncomeStatements(
  ticker: string,
  limit = 4
): Promise<FmpIncomeStatement[]> {
  const symbol = ticker.toUpperCase()
  const key = `fmp:income:${symbol}:${limit}`
  const cached = await getCache<FmpIncomeStatement[]>(key)
  if (cached) return cached

  const data = await fmpFetch<FmpIncomeStatement[]>(
    `income-statement?symbol=${symbol}&limit=${limit}&period=annual`
  )

  await setCache(key, data, CACHE_TTL.financials)
  return data
}

export async function getBalanceSheets(
  ticker: string,
  limit = 4
): Promise<FmpBalanceSheet[]> {
  const symbol = ticker.toUpperCase()
  const key = `fmp:balance:${symbol}:${limit}`
  const cached = await getCache<FmpBalanceSheet[]>(key)
  if (cached) return cached

  const data = await fmpFetch<FmpBalanceSheet[]>(
    `balance-sheet-statement?symbol=${symbol}&limit=${limit}&period=annual`
  )

  await setCache(key, data, CACHE_TTL.financials)
  return data
}

export async function getCashFlows(
  ticker: string,
  limit = 4
): Promise<FmpCashFlow[]> {
  const symbol = ticker.toUpperCase()
  const key = `fmp:cashflow:${symbol}:${limit}`
  const cached = await getCache<FmpCashFlow[]>(key)
  if (cached) return cached

  const data = await fmpFetch<FmpCashFlow[]>(
    `cash-flow-statement?symbol=${symbol}&limit=${limit}&period=annual`
  )

  await setCache(key, data, CACHE_TTL.financials)
  return data
}

export async function getKeyMetrics(
  ticker: string,
  limit = 4
): Promise<FmpKeyMetrics[]> {
  const symbol = ticker.toUpperCase()
  const key = `fmp:metrics:${symbol}:${limit}`
  const cached = await getCache<FmpKeyMetrics[]>(key)
  if (cached) return cached

  const data = await fmpFetch<FmpKeyMetrics[]>(
    `key-metrics?symbol=${symbol}&limit=${limit}&period=annual`
  )

  await setCache(key, data, CACHE_TTL.financials)
  return data
}
