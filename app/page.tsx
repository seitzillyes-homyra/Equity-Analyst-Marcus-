import AnalysisForm from './components/AnalysisForm'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-slate-900 text-white">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-sm font-bold">
              EA
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                Equity Analyst
              </h1>
              <p className="text-xs text-slate-400">
                Institutional-quality AI stock analysis
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main>
        <AnalysisForm />
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-4 py-6 text-center text-xs text-gray-400">
        Data: Financial Modeling Prep · FRED · Analysis: Claude AI ·{' '}
        <span className="font-medium">Not financial advice</span>
      </footer>
    </div>
  )
}
