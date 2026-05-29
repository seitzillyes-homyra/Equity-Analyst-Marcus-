interface Props {
  analysis: string
  model: string
  tokensUsed: number
  cached: boolean
  createdAt?: string
}

/** Renders markdown-style ## headings and bullet points from the AI analysis text */
export default function AnalysisPanel({
  analysis,
  model,
  tokensUsed,
  cached,
  createdAt,
}: Props) {
  const lines = analysis.split('\n')

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          AI Equity Analysis
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {cached && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
              Cached
            </span>
          )}
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-mono">
            {model.replace('claude-', '')}
          </span>
          <span className="text-xs text-gray-400">
            {tokensUsed.toLocaleString()} tokens
          </span>
          {createdAt && (
            <span className="text-xs text-gray-400">
              {new Date(createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
        {lines.map((line, i) => {
          if (line.startsWith('## ')) {
            return (
              <h2
                key={i}
                className="text-base font-bold text-gray-900 mt-6 mb-2 first:mt-0 pb-1 border-b border-gray-100"
              >
                {line.replace('## ', '')}
              </h2>
            )
          }
          if (line.startsWith('### ')) {
            return (
              <h3
                key={i}
                className="text-sm font-semibold text-gray-800 mt-4 mb-1"
              >
                {line.replace('### ', '')}
              </h3>
            )
          }
          if (line.startsWith('- ') || line.startsWith('* ')) {
            return (
              <div key={i} className="flex gap-2 my-1 ml-2">
                <span className="text-slate-400 mt-0.5">•</span>
                <span>{line.replace(/^[-*] /, '')}</span>
              </div>
            )
          }
          if (line.startsWith('**') && line.endsWith('**')) {
            return (
              <p key={i} className="font-semibold text-gray-900 mt-3">
                {line.replace(/\*\*/g, '')}
              </p>
            )
          }
          if (line.trim() === '') {
            return <div key={i} className="h-2" />
          }
          return (
            <p key={i} className="my-1">
              {renderInline(line)}
            </p>
          )
        })}
      </div>
    </div>
  )
}

/** Render **bold** inline markdown */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          part
        )
      )}
    </>
  )
}
