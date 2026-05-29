import type { FmpQuote, FmpProfile } from '@/lib/types'

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtBig(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  return `$${fmt(n)}`
}

interface Props {
  quote: FmpQuote
  profile: FmpProfile | null
}

export default function QuoteHeader({ quote, profile }: Props) {
  const up = quote.changePercentage >= 0

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      {/* Name row */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          {profile?.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.image}
              alt={`${quote.symbol} logo`}
              className="w-10 h-10 rounded-lg object-contain bg-gray-50"
            />
          )}
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {profile?.companyName ?? quote.symbol}
            </h2>
            <p className="text-sm text-gray-500">
              {quote.symbol}
              {profile && (
                <>
                  {' · '}
                  {profile.exchange}
                  {' · '}
                  {profile.sector}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Price */}
        <div className="text-right">
          <p className="text-3xl font-bold tabular-nums text-gray-900">
            ${fmt(quote.price)}
          </p>
          <p
            className={`text-sm font-semibold tabular-nums ${
              up ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {up ? '+' : ''}
            {fmt(quote.change)} ({up ? '+' : ''}
            {fmt(quote.changePercentage)}%)
          </p>
        </div>
      </div>

      {/* Metrics row */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-100">
        {[
          { label: 'Market Cap', value: fmtBig(quote.marketCap) },
          {
            label: '52-wk Range',
            value: `$${fmt(quote.yearLow)} – $${fmt(quote.yearHigh)}`,
          },
          { label: '50-day Avg', value: `$${fmt(quote.priceAvg50)}` },
          { label: '200-day Avg', value: `$${fmt(quote.priceAvg200)}` },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs text-gray-500 mb-0.5">{label}</p>
            <p className="text-sm font-semibold text-gray-800 tabular-nums">
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Description */}
      {profile?.description && (
        <p className="mt-4 text-sm text-gray-600 leading-relaxed line-clamp-3">
          {profile.description}
        </p>
      )}
    </div>
  )
}
