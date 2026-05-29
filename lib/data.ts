import { getFredSeries } from './fred'
import type { MacroData, FredSeriesData } from './types'

/** Fetch the six core FRED series and distil them into the MacroData shape. */
export async function fetchMacroData(): Promise<MacroData> {
  const [fedfunds, cpi, dgs10, unrate, gdp] = await Promise.allSettled([
    getFredSeries('FEDFUNDS', 2),   // Fed Funds Rate, monthly
    getFredSeries('CPIAUCSL', 14),  // CPI, monthly — need 13 for YoY
    getFredSeries('DGS10', 2),      // 10Y Treasury, daily
    getFredSeries('UNRATE', 2),     // Unemployment Rate, monthly
    getFredSeries('GDPC1', 5),      // Real GDP, quarterly
  ])

  function latest(r: PromiseSettledResult<FredSeriesData>): number {
    if (r.status !== 'fulfilled') return 0
    const v = parseFloat(r.value.observations[0]?.value ?? '0')
    return isNaN(v) ? 0 : v
  }

  // CPI: Year-over-year % from monthly index
  let cpiYoY = 0
  if (cpi.status === 'fulfilled') {
    const obs = cpi.value.observations
    if (obs.length >= 13) {
      const now = parseFloat(obs[0].value)
      const yearAgo = parseFloat(obs[12].value)
      if (!isNaN(now) && !isNaN(yearAgo) && yearAgo > 0) {
        cpiYoY = ((now - yearAgo) / yearAgo) * 100
      }
    }
  }

  // Real GDP: QoQ annualised growth
  let gdpGrowth = 0
  if (gdp.status === 'fulfilled') {
    const obs = gdp.value.observations
    if (obs.length >= 2) {
      const q1 = parseFloat(obs[0].value)
      const q0 = parseFloat(obs[1].value)
      if (!isNaN(q1) && !isNaN(q0) && q0 > 0) {
        gdpGrowth = ((q1 - q0) / q0) * 4 * 100
      }
    }
  }

  return {
    fedFundsRate: latest(fedfunds),
    cpi: parseFloat(cpiYoY.toFixed(2)),
    tenYearYield: latest(dgs10),
    unemploymentRate: latest(unrate),
    realGDPGrowth: parseFloat(gdpGrowth.toFixed(2)),
  }
}
