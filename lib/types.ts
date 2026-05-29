// ─── FMP stable API ──────────────────────────────────────────────────────────

export interface FmpQuote {
  symbol: string
  name: string
  price: number
  changePercentage: number
  change: number
  dayLow: number
  dayHigh: number
  yearHigh: number
  yearLow: number
  marketCap: number
  priceAvg50: number
  priceAvg200: number
  exchange: string
  volume: number
  open: number
  previousClose: number
  timestamp: number
}

export interface FmpProfile {
  symbol: string
  companyName: string
  sector: string
  industry: string
  country: string
  fullTimeEmployees: string
  description: string
  ceo: string
  website: string
  image: string
  ipoDate: string
  defaultImage: boolean
  isEtf: boolean
  isActivelyTrading: boolean
  averageVolume: number
  exchange: string
  exchangeFullName: string
  currency: string
  marketCap: number
  beta: number
  lastDividend: number
}

export interface FmpIncomeStatement {
  date: string
  symbol: string
  period: string
  fiscalYear: string
  revenue: number
  grossProfit: number
  operatingIncome: number
  netIncome: number
  ebitda: number
  eps: number
  epsDiluted: number
  grossProfitMargin?: number
  operatingIncomeMargin?: number
  netIncomeMargin?: number
}

export interface FmpBalanceSheet {
  date: string
  symbol: string
  period: string
  fiscalYear: string
  cashAndCashEquivalents: number
  totalCurrentAssets: number
  totalAssets: number
  totalCurrentLiabilities: number
  totalLiabilities: number
  totalStockholdersEquity: number
  totalDebt: number
  netDebt: number
  cashAndShortTermInvestments: number
}

export interface FmpCashFlow {
  date: string
  symbol: string
  period: string
  fiscalYear: string
  operatingCashFlow: number
  capitalExpenditure: number
  freeCashFlow: number
  commonDividendsPaid: number | null
  commonStockRepurchased: number | null
  netCashProvidedByOperatingActivities: number
  netCashProvidedByFinancingActivities: number
}

export interface FmpKeyMetrics {
  date: string
  symbol: string
  period: string
  fiscalYear: string
  marketCap: number
  enterpriseValue: number
  evToSales: number
  evToEBITDA: number
  evToOperatingCashFlow: number
  currentRatio: number
  returnOnEquity: number
  returnOnAssets: number
  returnOnInvestedCapital: number
  earningsYield: number
  freeCashFlowYield: number
  netDebtToEBITDA: number
  capexToOperatingCashFlow: number
  researchAndDevelopementToRevenue: number
  workingCapital: number
}

// ─── FRED ────────────────────────────────────────────────────────────────────

export interface FredObservation {
  date: string
  value: string
}

export interface FredSeries {
  id: string
  title: string
  observation_start: string
  observation_end: string
  frequency: string
  units: string
  seasonal_adjustment: string
  last_updated: string
  notes?: string
}

export interface FredSeriesData {
  series: FredSeries
  observations: FredObservation[]
}

// ─── Supabase DB rows ─────────────────────────────────────────────────────────

export interface ApiCacheRow {
  id: string
  cache_key: string
  data: unknown
  fetched_at: string
  expires_at: string
}

export interface AnalysisRow {
  id: string
  ticker: string
  query: string
  data: AnalysisData
  analysis: string
  model: string
  tokens_used: number
  created_at: string
}

// ─── App-level ────────────────────────────────────────────────────────────────

export interface AnalysisData {
  quote: FmpQuote
  profile: FmpProfile
  income: FmpIncomeStatement[]
  balance: FmpBalanceSheet[]
  cashflow: FmpCashFlow[]
  metrics: FmpKeyMetrics[]
  macro: Record<string, FredSeriesData>
}

export interface AnalyzeRequest {
  ticker: string
  query: string
}

export interface AnalyzeResponse {
  id: string
  analysis: string
  data: AnalysisData
  model: string
  tokens_used: number
  cached: boolean
  created_at: string
}

export interface QuoteApiResponse {
  quote: FmpQuote
  profile: FmpProfile | null
}

export type MacroApiResponse = Record<string, FredSeriesData>

// ─── Macro snapshot for wealth manager ───────────────────────────────────────

export interface MacroData {
  fedFundsRate: number
  cpi: number          // YoY %
  tenYearYield: number
  unemploymentRate: number
  realGDPGrowth: number // annualised QoQ %
}

// ─── Paper trading — portfolio & positions ────────────────────────────────────

export interface Portfolio {
  id: string
  userId: string
  name: string
  cashBalance: number
  startingCapital: number
  createdAt: string
  // computed
  totalValue?: number
  positionsValue?: number
}

export interface Position {
  id: string
  portfolioId: string
  ticker: string
  companyName: string
  shares: number
  avgCost: number
  currency: string
  openedAt: string
  // computed at runtime
  currentPrice?: number
  currentValue?: number
  unrealisedPnl?: number
  unrealisedPnlPercent?: number
}

export interface Trade {
  id: string
  portfolioId: string
  ticker: string
  companyName: string
  action: 'BUY' | 'SELL'
  shares: number
  price: number
  totalValue: number
  currency: string
  reasoning: string
  executedAt: string
}

export interface PortfolioSnapshot {
  id: string
  portfolioId: string
  totalValue: number
  cashBalance: number
  positionsValue: number
  snapshotDate: string
}

export interface Briefing {
  id: string
  portfolioId: string
  content: string
  tradesMade: Trade[]
  totalValueAfter: number
  createdAt: string
}

export interface WealthManagerDecision {
  action: 'BUY' | 'SELL' | 'HOLD'
  ticker: string
  companyName: string
  shares: number
  estimatedPrice: number
  reasoning: string
  conviction: 'HIGH' | 'MEDIUM' | 'LOW'
  ruleApplied: string
}

export interface WealthManagerResponse {
  briefing: string
  marketOutlook: string
  strategyCompliance: string
  decisions: WealthManagerDecision[]
  watchlist: string[]
  challengeNote: string
}

// ─── Raw Supabase row types (snake_case) ─────────────────────────────────────

export interface PortfolioRow {
  id: string
  user_id: string
  name: string
  cash_balance: number
  starting_capital: number
  created_at: string
}

export interface PositionRow {
  id: string
  portfolio_id: string
  ticker: string
  company_name: string
  shares: number
  avg_cost: number
  currency: string
  opened_at: string
}

export interface TradeRow {
  id: string
  portfolio_id: string
  ticker: string
  company_name: string
  action: 'BUY' | 'SELL'
  shares: number
  price: number
  total_value: number
  currency: string
  reasoning: string
  executed_at: string
}

export interface SnapshotRow {
  id: string
  portfolio_id: string
  total_value: number
  cash_balance: number
  positions_value: number
  snapshot_date: string
}

export interface BriefingRow {
  id: string
  portfolio_id: string
  content: string
  trades_made: TradeRow[]
  total_value_after: number
  created_at: string
  watchlist?: string[] | null
}
