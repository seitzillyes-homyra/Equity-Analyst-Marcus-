'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import type { PortfolioRow, PositionRow, SnapshotRow, TradeRow, BriefingRow } from '@/lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface EnrichedPosition extends PositionRow {
  currentPrice: number
  currentValue: number
  unrealisedPnl: number
  unrealisedPnlPercent: number
}

interface PortfolioData {
  portfolio: PortfolioRow & { totalValue: number; positionsValue: number }
  positions: EnrichedPosition[]
  snapshots: SnapshotRow[]
  trades: TradeRow[]
  latestBriefing: BriefingRow | null
  briefingsCount: number
}

interface MacroDisplay {
  fedFunds: string
  cpiYoy: string
  tenYear: string
  unemploy: string
  gdpQoQ: string
}

type ChartRange = '1W' | '1M' | '3M' | 'All'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt2(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'k'
  return '$' + fmt2(n)
}

function marketIsOpen(): boolean {
  const est = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = est.getDay()
  const mins = est.getHours() * 60 + est.getMinutes()
  return day >= 1 && day <= 5 && mins >= 570 && mins < 960
}

const TICKER_STYLES: Record<string, { bg: string; color: string; abbr: string }> = {
  NVDA:  { bg: 'rgba(79,138,239,0.15)',  color: '#4f8aef', abbr: 'NV' },
  META:  { bg: 'rgba(168,85,247,0.15)',  color: '#a855f7', abbr: 'MT' },
  MSFT:  { bg: 'rgba(245,168,32,0.15)',  color: '#f5a820', abbr: 'MS' },
  AAPL:  { bg: 'rgba(0,212,161,0.15)',   color: '#00d4a1', abbr: 'AP' },
  GOOGL: { bg: 'rgba(240,67,97,0.15)',   color: '#f04361', abbr: 'GO' },
  AMZN:  { bg: 'rgba(245,168,32,0.15)',  color: '#f5a820', abbr: 'AM' },
  TSLA:  { bg: 'rgba(240,67,97,0.15)',   color: '#f04361', abbr: 'TS' },
  TSM:   { bg: 'rgba(79,138,239,0.15)',  color: '#4f8aef', abbr: 'TS' },
  ASML:  { bg: 'rgba(168,85,247,0.15)', color: '#a855f7', abbr: 'AS' },
  CRM:   { bg: 'rgba(79,138,239,0.15)',  color: '#4f8aef', abbr: 'CR' },
}

function tickerStyle(ticker: string) {
  return TICKER_STYLES[ticker] ?? {
    bg: 'rgba(255,255,255,0.08)',
    color: '#7c8fa8',
    abbr: ticker.slice(0, 2).toUpperCase(),
  }
}

const CARD: React.CSSProperties = {
  background: '#0f1624',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 12,
  overflow: 'hidden',
  position: 'relative',
}

const CARD_HDR: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '11px 18px',
  borderBottom: '1px solid rgba(255,255,255,0.03)',
}

const CT: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.8px',
  textTransform: 'uppercase',
  color: '#3a4d62',
}

function Badge({ up, children }: { up: boolean; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
      padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap',
      background: up ? 'rgba(0,212,161,0.12)' : 'rgba(240,67,97,0.12)',
      color: up ? '#00d4a1' : '#f04361',
    }}>
      {children}
    </span>
  )
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ onClick }: { onClick: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { onClick(); setCopied(true); setTimeout(() => setCopied(false), 1400) }}
      style={{
        fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 5,
        border: `1px solid ${copied ? '#00d4a1' : 'rgba(255,255,255,0.07)'}`,
        background: 'none',
        color: copied ? '#00d4a1' : '#3a4d62',
        cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ── CopyModal ─────────────────────────────────────────────────────────────────

function CopyModal({ ticker, shares, price, onClose }: {
  ticker: string; shares: number; price: number; onClose: () => void
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#141e30', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 24, maxWidth: 360, width: '100%' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#dde4ef', marginBottom: 12 }}>Copy Trade</h3>
        <p style={{ fontSize: 12, color: '#7c8fa8', lineHeight: 1.78 }}>
          Buy <strong style={{ color: '#dde4ef' }}>{shares} share{shares !== 1 ? 's' : ''}</strong> of{' '}
          <strong style={{ color: '#dde4ef' }}>{ticker}</strong> at market price on your broker.
        </p>
        <p style={{ fontSize: 12, color: '#7c8fa8', marginTop: 8 }}>
          Current price:{' '}
          <span style={{ fontFamily: 'var(--mono)', color: '#dde4ef' }}>${fmt2(price)}</span>
        </p>
        <p style={{ fontSize: 11, color: '#f5a820', background: 'rgba(245,168,32,0.1)', borderRadius: 7, padding: '10px 12px', marginTop: 12 }}>
          This is a paper trade. Always do your own research before investing real money.
        </p>
        <button onClick={onClose} style={{ marginTop: 16, width: '100%', padding: '10px 0', borderRadius: 8, background: '#00d4a1', color: '#031a12', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          Got it
        </button>
      </div>
    </div>
  )
}

// ── PerformanceChart ──────────────────────────────────────────────────────────

function PerformanceChart({ snapshots, startingCapital }: {
  snapshots: SnapshotRow[]
  startingCapital: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ACCENT = '#00d4a1'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.offsetWidth || 600
    const cssH = 204
    canvas.width = cssW * dpr
    canvas.height = cssH * dpr
    canvas.style.width = cssW + 'px'
    canvas.style.height = cssH + 'px'
    ctx.scale(dpr, dpr)

    const W = cssW, H = cssH
    const pad = { t: 10, r: 14, b: 32, l: 60 }
    const cW = W - pad.l - pad.r
    const cH = H - pad.t - pad.b

    ctx.clearRect(0, 0, W, H)

    if (snapshots.length === 0) {
      ctx.fillStyle = '#3a4d62'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('No data yet — run Marcus to build the portfolio', W / 2, H / 2)
      return
    }

    const values = snapshots.map(s => s.total_value)
    const allV = [...values, startingCapital]
    const rawMin = Math.min(...allV)
    const rawMax = Math.max(...allV)
    const padding = (rawMax - rawMin) * 0.1 || rawMax * 0.05
    const minV = rawMin - padding
    const maxV = rawMax + padding

    const xOf = (i: number) =>
      snapshots.length === 1
        ? pad.l + (i === 0 ? 0 : cW)
        : pad.l + (i / (snapshots.length - 1)) * cW
    const yOf = (v: number) => pad.t + cH - ((v - minV) / (maxV - minV)) * cH

    // Y gridlines + labels
    for (let i = 0; i <= 4; i++) {
      const v = minV + ((maxV - minV) * i) / 4
      const y = yOf(v)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'
      ctx.lineWidth = 1
      ctx.moveTo(pad.l, y)
      ctx.lineTo(W - pad.r, y)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.22)'
      ctx.font = '10px monospace'
      ctx.textAlign = 'right'
      ctx.fillText('$' + (v / 1000).toFixed(1) + 'k', pad.l - 6, y + 4)
    }

    // X axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    const step = Math.ceil(snapshots.length / 6)
    snapshots.forEach((s, i) => {
      if (i % step !== 0 && i !== snapshots.length - 1) return
      const d = new Date(s.snapshot_date)
      ctx.fillText(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), xOf(i), H - pad.b + 18)
    })

    // Starting capital dashed reference line
    const refY = yOf(startingCapital)
    ctx.beginPath()
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(255,255,255,0.13)'
    ctx.lineWidth = 1
    ctx.moveTo(pad.l, refY)
    ctx.lineTo(W - pad.r, refY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('Start $' + (startingCapital / 1000).toFixed(0) + 'k', pad.l + 5, refY - 4)

    const drawSnaps = snapshots.length === 1 ? [snapshots[0], snapshots[0]] : snapshots
    const lastX = xOf(drawSnaps.length - 1)

    // Area fill
    ctx.save()
    ctx.beginPath()
    drawSnaps.forEach((s, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(s.total_value)) : ctx.lineTo(xOf(i), yOf(s.total_value)))
    ctx.lineTo(lastX, yOf(minV))
    ctx.lineTo(pad.l, yOf(minV))
    ctx.closePath()
    const grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b)
    grad.addColorStop(0, ACCENT + '45')
    grad.addColorStop(0.65, ACCENT + '12')
    grad.addColorStop(1, ACCENT + '00')
    ctx.fillStyle = grad
    ctx.fill()
    ctx.restore()

    // Main line with glow
    ctx.beginPath()
    drawSnaps.forEach((s, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(s.total_value)) : ctx.lineTo(xOf(i), yOf(s.total_value)))
    ctx.strokeStyle = ACCENT
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.shadowColor = ACCENT
    ctx.shadowBlur = 10
    ctx.stroke()
    ctx.shadowBlur = 0

    // End dot
    const lx = xOf(snapshots.length - 1)
    const ly = yOf(values[values.length - 1])
    ctx.beginPath()
    ctx.arc(lx, ly, 5, 0, Math.PI * 2)
    ctx.fillStyle = ACCENT
    ctx.shadowColor = ACCENT
    ctx.shadowBlur = 16
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.beginPath()
    ctx.arc(lx, ly, 5, 0, Math.PI * 2)
    ctx.strokeStyle = '#0f1624'
    ctx.lineWidth = 2
    ctx.stroke()

    // Value label near end dot
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'right'
    ctx.fillText('$' + fmt2(values[values.length - 1]), lx - 8, ly - 8)

  }, [snapshots, startingCapital])

  return (
    <div style={{ width: '100%' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 204 }} />
    </div>
  )
}

// ── DonutChart ────────────────────────────────────────────────────────────────

const DONUT_COLORS = ['#00d4a1', '#4f8aef', '#a855f7', '#f5a820', '#f04361']

function DonutChart({ positions, cash, totalValue }: {
  positions: EnrichedPosition[]
  cash: number
  totalValue: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const sz = 90
    canvas.width = sz * dpr
    canvas.height = sz * dpr
    canvas.style.width = sz + 'px'
    canvas.style.height = sz + 'px'
    ctx.scale(dpr, dpr)

    const cx = sz / 2, cy = sz / 2, ro = 38, ri = 26, GAP = 0.05

    const segs = [
      { pct: cash / totalValue, color: DONUT_COLORS[0] },
      ...positions.map((p, i) => ({
        pct: p.currentValue / totalValue,
        color: DONUT_COLORS[i + 1] ?? DONUT_COLORS[DONUT_COLORS.length - 1],
      })),
    ]

    let angle = -Math.PI / 2
    segs.forEach(s => {
      if (s.pct <= 0) return
      const sweep = s.pct * Math.PI * 2 - GAP
      ctx.beginPath()
      ctx.arc(cx, cy, ro, angle, angle + sweep)
      ctx.arc(cx, cy, ri, angle + sweep, angle, true)
      ctx.closePath()
      ctx.fillStyle = s.color
      ctx.fill()
      angle += s.pct * Math.PI * 2
    })

    ctx.beginPath()
    ctx.arc(cx, cy, ri - 1.5, 0, Math.PI * 2)
    ctx.fillStyle = '#0f1624'
    ctx.fill()
  }, [positions, cash, totalValue])

  return (
    <div style={{ position: 'relative', width: 90, height: 90, flexShrink: 0 }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: '#dde4ef', lineHeight: 1 }}>
          {fmtK(totalValue)}
        </span>
        <span style={{ fontSize: 9, color: '#3a4d62', marginTop: 2 }}>total</span>
      </div>
    </div>
  )
}

// ── PositionProgressBar ───────────────────────────────────────────────────────

function PositionProgressBar({ position }: { position: EnrichedPosition }) {
  const stopPrice = position.avg_cost * 0.88
  const targetPrice = position.avg_cost * 1.40
  const rawPct = ((position.currentPrice - stopPrice) / (targetPrice - stopPrice)) * 100
  const fillPct = Math.max(0, Math.min(100, rawPct))
  const bgSize = fillPct > 0 ? `${(100 / (fillPct / 100)).toFixed(1)}% 100%` : '100% 100%'

  return (
    <div style={{ minWidth: 130 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9, color: '#3a4d62', marginBottom: 3 }}>
        <span>${Math.round(stopPrice)}</span>
        <span>${Math.round(targetPrice)}</span>
      </div>
      <div style={{ position: 'relative', height: 4, borderRadius: 2, background: 'linear-gradient(90deg,rgba(240,67,97,0.18),rgba(245,168,32,0.15),rgba(0,212,161,0.18))' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: fillPct + '%', borderRadius: 2, background: 'linear-gradient(90deg,#f04361,#f5a820,#00d4a1)', backgroundSize: bgSize }} />
        <div style={{ position: 'absolute', top: '50%', left: fillPct + '%', transform: 'translate(-50%,-50%)', width: 9, height: 9, borderRadius: '50%', background: '#dde4ef', boxShadow: '0 0 6px rgba(255,255,255,0.35)' }} />
      </div>
    </div>
  )
}

// ── StrategyRules ─────────────────────────────────────────────────────────────

type RuleStatus = 'pass' | 'warn' | 'fail'

function StrategyRules({ positions, portfolio }: {
  positions: EnrichedPosition[]
  portfolio: PortfolioRow & { totalValue: number }
}) {
  function RuleRow({ status, children }: { status: RuleStatus; children: React.ReactNode }) {
    const icon = status === 'pass' ? '✓' : status === 'warn' ? '⚠' : '✗'
    const color = status === 'pass' ? '#00d4a1' : status === 'warn' ? '#f5a820' : '#f04361'
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: '#7c8fa8', lineHeight: 1.5 }}>
        <span style={{ color, fontSize: 10, flexShrink: 0, marginTop: 1.5 }}>{icon}</span>
        <span>{children}</span>
      </div>
    )
  }

  const cashPct = portfolio.totalValue > 0 ? (portfolio.cash_balance / portfolio.totalValue) * 100 : 0
  const cashStatus: RuleStatus = cashPct >= 15 ? 'pass' : 'fail'

  const heaviestPos = positions.reduce<EnrichedPosition | null>((worst, p) => {
    const w = portfolio.totalValue > 0 ? (p.currentValue / portfolio.totalValue) * 100 : 0
    const ww = worst && portfolio.totalValue > 0 ? (worst.currentValue / portfolio.totalValue) * 100 : 0
    return w > ww ? p : worst
  }, null)
  const posWeightStatus: RuleStatus = heaviestPos && portfolio.totalValue > 0 && (heaviestPos.currentValue / portfolio.totalValue) * 100 > 25 ? 'fail' : 'pass'

  const worstPos = positions.reduce<EnrichedPosition | null>((w, p) => (!w || p.unrealisedPnlPercent < w.unrealisedPnlPercent ? p : w), null)
  const stopStatus: RuleStatus = worstPos && worstPos.unrealisedPnlPercent < -12 ? 'fail' : worstPos && worstPos.unrealisedPnlPercent < -8 ? 'warn' : 'pass'

  const bestPos = positions.reduce<EnrichedPosition | null>((b, p) => (!b || p.unrealisedPnlPercent > b.unrealisedPnlPercent ? p : b), null)
  const tpStatus: RuleStatus = bestPos && bestPos.unrealisedPnlPercent >= 40 ? 'warn' : 'pass'

  const posCountStatus: RuleStatus = positions.length <= 5 ? 'pass' : 'fail'

  const passingCount = [cashStatus, posWeightStatus, stopStatus, tpStatus, posCountStatus].filter(s => s === 'pass').length + 2

  return (
    <div>
      <div style={CARD_HDR}>
        <span style={CT}>Strategy Rules</span>
        <span style={{ fontSize: 10, color: '#00d4a1' }}>{passingCount} / 7 passing</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '11px 18px' }}>
        <RuleRow status="pass">Revenue growth &gt;15% YoY</RuleRow>
        <RuleRow status="pass">Within 10% of 52-week high</RuleRow>
        <RuleRow status={posWeightStatus}>
          Max 25% per position{heaviestPos && posWeightStatus !== 'pass' && (
            <span style={{ color: '#3a4d62' }}> ({heaviestPos.ticker} at {((heaviestPos.currentValue / portfolio.totalValue) * 100).toFixed(1)}%)</span>
          )}
        </RuleRow>
        <RuleRow status={cashStatus}>
          Min 15% cash reserve <span style={{ color: '#3a4d62' }}>({cashPct.toFixed(1)}% held)</span>
        </RuleRow>
        <RuleRow status={stopStatus}>
          Stop −12%{worstPos && <span style={{ color: '#3a4d62' }}> ({worstPos.ticker} at {worstPos.unrealisedPnlPercent.toFixed(1)}%)</span>}
        </RuleRow>
        <RuleRow status={tpStatus}>
          Take profit +40%{bestPos && <span style={{ color: '#3a4d62' }}> ({bestPos.ticker} at {bestPos.unrealisedPnlPercent.toFixed(1)}%)</span>}
        </RuleRow>
        <RuleRow status={posCountStatus}>
          Max 5 positions <span style={{ color: '#3a4d62' }}>({positions.length} open)</span>
        </RuleRow>
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  const shimmer = (w: string, h: number, mb = 8) => (
    <div style={{ width: w, height: h, background: 'rgba(255,255,255,0.05)', borderRadius: 6, marginBottom: mb }} />
  )
  return (
    <div style={{ padding: '60px 20px', maxWidth: 1580, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 13 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 13 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ ...CARD, padding: 18 }}>
            {shimmer('60%', 8)}
            {shimmer('80%', 24)}
            {shimmer('50%', 10, 0)}
          </div>
        ))}
      </div>
      <div style={{ ...CARD, height: 300 }} />
      <div style={{ ...CARD, height: 180 }} />
    </div>
  )
}

// ── Dashboard Page ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<PortfolioData | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionsDone, setSessionsDone] = useState(false)
  const [copyModal, setCopyModal] = useState<{ ticker: string; shares: number; price: number } | null>(null)
  const [priceTicks, setPriceTicks] = useState<Record<string, 'up' | 'down'>>({})
  const prevPricesRef = useRef<Record<string, number>>({})
  const [userId, setUserId] = useState<string | null>(null)
  const [briefingExpanded, setBriefingExpanded] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [chartRange, setChartRange] = useState<ChartRange>('1M')
  const [macro, setMacro] = useState<MacroDisplay | null>(null)
  const [clock, setClock] = useState('')
  const [isMarketOpen, setIsMarketOpen] = useState(false)

  // Load userId from localStorage
  useEffect(() => {
    let id = localStorage.getItem('ea_user_id')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('ea_user_id', id) }
    setUserId(id)
  }, [])

  // Fetch portfolio data
  const fetchData = useCallback(async (uid: string) => {
    try {
      const res = await fetch(`/api/portfolio?userId=${uid}`)
      if (!res.ok) throw new Error(await res.text())
      const json: PortfolioData = await res.json()

      // Detect price ticks and flash changed cells
      const ticks: Record<string, 'up' | 'down'> = {}
      json.positions.forEach(p => {
        const prev = prevPricesRef.current[p.ticker]
        if (prev != null && prev !== p.currentPrice) {
          ticks[p.ticker] = p.currentPrice > prev ? 'up' : 'down'
        }
        prevPricesRef.current[p.ticker] = p.currentPrice
      })
      if (Object.keys(ticks).length > 0) {
        setPriceTicks(ticks)
        setTimeout(() => setPriceTicks({}), 1400)
      }

      setData(json)
      setLastUpdated(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load portfolio')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    fetchData(userId)
    // 15 s during US market hours, 60 s otherwise
    const iv = setInterval(() => fetchData(userId), isMarketOpen ? 15_000 : 60_000)
    return () => clearInterval(iv)
  }, [userId, fetchData, isMarketOpen])

  // Fetch macro data
  useEffect(() => {
    async function loadMacro() {
      try {
        const [snapshotRes, cpiRes] = await Promise.all([
          fetch('/api/macro'),
          fetch('/api/macro?series=CPIAUCSL&limit=13'),
        ])
        if (!snapshotRes.ok) return
        const snap = await snapshotRes.json()

        const fedFunds = parseFloat(snap.FEDFUNDS?.observations?.[0]?.value ?? '0')
        const tenYear = parseFloat(snap.DGS10?.observations?.[0]?.value ?? '0')
        const unemploy = parseFloat(snap.UNRATE?.observations?.[0]?.value ?? '0')

        const gdpObs: { value: string }[] = snap.GDP?.observations ?? []
        let gdpQoQ = 0
        if (gdpObs.length >= 2) {
          const l = parseFloat(gdpObs[0].value)
          const p = parseFloat(gdpObs[1].value)
          gdpQoQ = ((l - p) / p) * 100 * 4 // annualised QoQ
        }

        let cpiYoy = 0
        if (cpiRes.ok) {
          const cpiData = await cpiRes.json()
          const obs: { value: string }[] = cpiData.observations ?? []
          if (obs.length >= 13) {
            cpiYoy = ((parseFloat(obs[0].value) - parseFloat(obs[12].value)) / parseFloat(obs[12].value)) * 100
          }
        }

        setMacro({
          fedFunds: fedFunds.toFixed(2) + '%',
          cpiYoy: cpiYoy.toFixed(1) + '%',
          tenYear: tenYear.toFixed(2) + '%',
          unemploy: unemploy.toFixed(1) + '%',
          gdpQoQ: (gdpQoQ >= 0 ? '+' : '') + gdpQoQ.toFixed(1) + '%',
        })
      } catch {
        // macro is non-critical; silently fail
      }
    }
    loadMacro()
  }, [])

  // Live clock + market status
  useEffect(() => {
    function tick() {
      setClock(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false, timeZone: 'America/New_York',
        }) + ' EST'
      )
      setIsMarketOpen(marketIsOpen())
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])

  // Run Marcus
  async function runManager() {
    if (!data || running || sessionsDone) return
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolioId: data.portfolio.id }),
      })
      const json = await res.json()
      if (res.status === 429) {
        setSessionsDone(true)
        return
      }
      if (!res.ok) throw new Error(json.error ?? 'Manager run failed')
      const n = json.tradesExecuted?.length ?? 0
      setToast(`Day ${json.dayNumber} complete — Marcus made ${n} trade${n !== 1 ? 's' : ''}`)
      setTimeout(() => setToast(null), 5000)
      await fetchData(userId!)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed')
    } finally {
      setRunning(false)
    }
  }

  if (loading) return <Skeleton />
  if (!data) return <div style={{ padding: 40, color: '#f04361' }}>{error ?? 'No data'}</div>

  const { portfolio, positions, snapshots, trades, latestBriefing, briefingsCount } = data
  const pnlDollars = portfolio.totalValue - portfolio.starting_capital
  const pnlPct = portfolio.starting_capital > 0 ? (pnlDollars / portfolio.starting_capital) * 100 : 0
  const cashPct = portfolio.totalValue > 0 ? (portfolio.cash_balance / portfolio.totalValue) * 100 : 0
  const challengePct = Math.min((briefingsCount / 30) * 100, 100)

  const totalUnrealisedPnl = positions.reduce((s, p) => s + p.unrealisedPnl, 0)
  const totalUnrealisedPct = portfolio.starting_capital > 0 ? (totalUnrealisedPnl / portfolio.starting_capital) * 100 : 0

  const briefingContent = latestBriefing?.content ?? ''
  const briefingParts = briefingContent.split('\n\n---\n\n')
  const tradingPart = briefingParts.length >= 2 ? briefingParts.slice(1).join('\n\n---\n\n') : briefingContent

  const lastRunDate = latestBriefing
    ? new Date(latestBriefing.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Never'

  // Filter snapshots by chart range
  const now = Date.now()
  const rangeMs: Record<ChartRange, number> = { '1W': 7, '1M': 30, '3M': 90, 'All': Infinity }
  const filteredSnaps = snapshots.filter(s => {
    const age = (now - new Date(s.snapshot_date).getTime()) / 86_400_000
    return age <= rangeMs[chartRange]
  })

  // Donut legend
  const donutLegend = [
    { label: 'Cash', pct: cashPct, color: DONUT_COLORS[0] },
    ...positions.map((p, i) => ({
      label: p.ticker,
      pct: portfolio.totalValue > 0 ? (p.currentValue / portfolio.totalValue) * 100 : 0,
      color: DONUT_COLORS[i + 1] ?? DONUT_COLORS[DONUT_COLORS.length - 1],
    })),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative', zIndex: 1 }}>

      {/* ── Navbar ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', gap: 14,
        height: 50, padding: '0 20px',
        background: 'rgba(8,11,22,0.94)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, letterSpacing: -0.4, color: '#dde4ef', flexShrink: 0 }}>
          <div style={{ width: 24, height: 24, borderRadius: 7, background: '#00d4a1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 13 13" fill="none" width={13} height={13}>
              <polyline points="1,10 4.5,5.5 7.5,7.5 12,2.5" stroke="#031a12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          EquityBot
        </div>

        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />

        <span style={{ fontSize: 11, color: '#7c8fa8', whiteSpace: 'nowrap', flexShrink: 0 }}>
          <strong style={{ color: '#dde4ef', fontWeight: 600 }}>Growth Momentum</strong>
          &nbsp;·&nbsp; Paper Portfolio
        </span>

        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: 'rgba(79,138,239,0.12)', color: '#4f8aef', flexShrink: 0 }}>
          Day {briefingsCount} / 30
        </span>

        {/* Macro strip */}
        {macro && (
          <div style={{ display: 'flex', gap: 18, marginLeft: 'auto' }}>
            {([
              { label: 'Fed Funds', val: macro.fedFunds, hi: parseFloat(macro.fedFunds) >= 5 },
              { label: 'CPI YoY',  val: macro.cpiYoy,   hi: false },
              { label: '10Y Yield', val: macro.tenYear,  hi: parseFloat(macro.tenYear) >= 4 },
              { label: 'Unemploy.', val: macro.unemploy, hi: false },
              { label: 'GDP QoQ',  val: macro.gdpQoQ,   hi: false },
            ] as const).map(item => (
              <div key={item.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: '#3a4d62', lineHeight: 1 }}>{item.label}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 500, color: item.hi ? '#f5a820' : '#7c8fa8', lineHeight: 1 }}>{item.val}</span>
              </div>
            ))}
          </div>
        )}
        {!macro && <div style={{ marginLeft: 'auto' }} />}

        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />

        {/* Market status + auto-run indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, background: isMarketOpen ? 'rgba(0,212,161,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isMarketOpen ? 'rgba(0,212,161,0.3)' : 'rgba(255,255,255,0.07)'}` }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: isMarketOpen ? '#00d4a1' : '#3a4d62', boxShadow: isMarketOpen ? '0 0 7px #00d4a1' : 'none', animation: isMarketOpen ? 'pdot 2s infinite' : 'none' }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: isMarketOpen ? '#00d4a1' : '#3a4d62' }}>
              {isMarketOpen ? 'LIVE' : 'CLOSED'}
            </span>
          </div>
          <span style={{ fontSize: 10, color: '#3a4d62' }}>Auto 15:45 CET</span>
        </div>

        {/* Run Marcus */}
        <button
          onClick={runManager}
          disabled={running || sessionsDone}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '7px 15px',
            background: sessionsDone ? '#f5a820' : '#00d4a1',
            color: '#031a12',
            fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 7,
            cursor: (running || sessionsDone) ? 'not-allowed' : 'pointer',
            opacity: (running || sessionsDone) ? 0.5 : 1,
            transition: 'box-shadow 0.2s, opacity 0.2s',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
          onMouseEnter={e => { if (!running) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 22px rgba(0,212,161,0.38)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none' }}
        >
          {running ? (
            <>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#031a12" strokeWidth="2.5" style={{ animation: 'spin 0.75s linear infinite', flexShrink: 0 }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" />
              </svg>
              Researching…
            </>
          ) : (
            <>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#031a12', opacity: 0.5, animation: 'pdot 2s infinite' }} />
              Run Marcus
            </>
          )}
        </button>
      </nav>

      {/* ── Main Content ── */}
      <div style={{ flex: 1, maxWidth: 1580, width: '100%', margin: '0 auto', padding: '16px 20px 36px', display: 'flex', flexDirection: 'column', gap: 13 }}>

        {sessionsDone && (
          <div style={{ background: 'rgba(245,168,32,0.1)', border: '1px solid rgba(245,168,32,0.3)', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#f5a820' }}>
            Both sessions complete for today. Come back tomorrow.
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(240,67,97,0.12)', border: '1px solid rgba(240,67,97,0.3)', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#f04361' }}>
            {error}
          </div>
        )}

        {/* ── KPI Row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 13 }}>

          {/* Portfolio Value */}
          <div style={{ ...CARD, padding: '15px 18px' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,#00d4a1,transparent)', pointerEvents: 'none' }} />
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: '#3a4d62', marginBottom: 7 }}>Portfolio Value</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 23, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1, marginBottom: 9 }}>
              ${fmt2(portfolio.totalValue)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <Badge up={pnlDollars >= 0}>{pnlDollars >= 0 ? '▲' : '▼'} {Math.abs(pnlPct).toFixed(2)}%</Badge>
              <span style={{ fontSize: 11, color: '#3a4d62' }}>{pnlDollars >= 0 ? '+' : ''}{fmtK(pnlDollars)} all-time</span>
            </div>
          </div>

          {/* Cash Reserve */}
          <div style={{ ...CARD, padding: '15px 18px' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,#4f8aef,transparent)', pointerEvents: 'none' }} />
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: '#3a4d62', marginBottom: 7 }}>Cash Reserve</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 23, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1 }}>
              ${fmt2(portfolio.cash_balance)}
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', margin: '7px 0 5px' }}>
              <div style={{ height: '100%', width: Math.min(cashPct, 100) + '%', background: '#4f8aef', borderRadius: 2, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#3a4d62' }}>{cashPct.toFixed(1)}% of portfolio</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 600, padding: '3px 8px', borderRadius: 5, background: 'rgba(79,138,239,0.12)', color: '#4f8aef', whiteSpace: 'nowrap' }}>
                {cashPct >= 15 ? '✓ >15% rule' : '✗ <15% rule'}
              </span>
            </div>
          </div>

          {/* Unrealised P&L */}
          <div style={{ ...CARD, padding: '15px 18px' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${totalUnrealisedPnl >= 0 ? '#00d4a1' : '#f04361'},transparent)`, pointerEvents: 'none' }} />
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: '#3a4d62', marginBottom: 7 }}>Unrealised P&amp;L</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 23, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1, marginBottom: 9, color: totalUnrealisedPnl >= 0 ? '#00d4a1' : '#f04361' }}>
              {totalUnrealisedPnl >= 0 ? '+' : ''}${fmt2(totalUnrealisedPnl)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <Badge up={totalUnrealisedPnl >= 0}>{totalUnrealisedPnl >= 0 ? '▲' : '▼'} {Math.abs(totalUnrealisedPct).toFixed(2)}%</Badge>
              <span style={{ fontSize: 11, color: '#3a4d62' }}>{positions.length} open position{positions.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* 30-Day Challenge */}
          <div style={{ ...CARD, padding: '15px 18px' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,#a855f7,transparent)', pointerEvents: 'none' }} />
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: '#3a4d62', marginBottom: 7 }}>30-Day Challenge</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 23, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1, color: '#4f8aef' }}>Day {briefingsCount}</div>
              <span style={{ fontSize: 11, color: '#3a4d62' }}>/ 30</span>
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', margin: '7px 0 5px' }}>
              <div style={{ height: '100%', width: challengePct + '%', background: 'linear-gradient(90deg,#4f8aef,#00d4a1)', borderRadius: 2, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#3a4d62' }}>{challengePct.toFixed(0)}% complete</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 5, background: 'rgba(79,138,239,0.12)', color: '#4f8aef', whiteSpace: 'nowrap' }}>
                Next: Tomorrow
              </span>
            </div>
          </div>

        </div>

        {/* ── Mid Row: Chart + Right Column ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 310px', gap: 13 }}>

          {/* Performance Chart */}
          <div style={CARD}>
            <div style={CARD_HDR}>
              <span style={CT}>Portfolio Performance</span>
              <div style={{ display: 'flex', gap: 2 }}>
                {(['1W', '1M', '3M', 'All'] as ChartRange[]).map(r => (
                  <button key={r} onClick={() => setChartRange(r)} style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 5, border: 'none', background: chartRange === r ? 'rgba(255,255,255,0.09)' : 'none', color: chartRange === r ? '#dde4ef' : '#3a4d62', cursor: 'pointer', transition: 'all 0.15s' }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: '14px 18px 10px' }}>
              <PerformanceChart snapshots={filteredSnaps} startingCapital={portfolio.starting_capital} />
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>

            {/* Allocation Donut */}
            <div style={CARD}>
              <div style={CARD_HDR}>
                <span style={CT}>Allocation</span>
                <span style={{ fontSize: 10, color: '#3a4d62' }}>{positions.length} position{positions.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px' }}>
                {portfolio.totalValue > 0 && (
                  <DonutChart positions={positions} cash={portfolio.cash_balance} totalValue={portfolio.totalValue} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 0 }}>
                  {donutLegend.map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                      <span style={{ color: '#7c8fa8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 500, color: '#dde4ef' }}>{item.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Strategy Rules */}
            <div style={CARD}>
              <StrategyRules positions={positions} portfolio={portfolio} />
            </div>

          </div>
        </div>

        {/* ── Positions Table ── */}
        <div style={CARD}>
          <div style={CARD_HDR}>
            <span style={CT}>Open Positions</span>
            <span style={{ fontSize: 10, color: '#3a4d62' }}>
              {positions.length} of 5 max &nbsp;·&nbsp; Progress bar: stop loss → take profit
              {lastUpdated && ` · Refreshed ${lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
            </span>
          </div>

          {positions.length === 0 ? (
            <div style={{ padding: '40px 18px', textAlign: 'center', fontSize: 12, color: '#3a4d62' }}>
              No positions yet. Run Marcus to build the portfolio.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Ticker', 'Shares', 'Avg Cost', 'Price', 'Value', 'P&L $', 'P&L %', 'Stop → Target', 'Weight', ''].map((h, i) => (
                      <th key={h + i} style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: '#3a4d62',
                        padding: i === 7 ? '10px 16px 10px 20px' : '10px 16px',
                        textAlign: i === 0 || i === 7 ? 'left' : 'right',
                        borderBottom: '1px solid rgba(255,255,255,0.07)',
                        whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map(p => {
                    const ts = tickerStyle(p.ticker)
                    const posUp = p.unrealisedPnl >= 0
                    const weight = portfolio.totalValue > 0 ? (p.currentValue / portfolio.totalValue) * 100 : 0
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                        onMouseEnter={e => { Array.from((e.currentTarget as HTMLTableRowElement).cells).forEach(td => { td.style.background = 'rgba(255,255,255,0.015)' }) }}
                        onMouseLeave={e => { Array.from((e.currentTarget as HTMLTableRowElement).cells).forEach(td => { td.style.background = '' }) }}
                      >
                        <td style={{ padding: '11px 16px', verticalAlign: 'middle', textAlign: 'left' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: ts.bg, color: ts.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                              {ts.abbr}
                            </div>
                            <div>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: '#dde4ef', lineHeight: 1.2 }}>{p.ticker}</div>
                              <div style={{ fontSize: 10, color: '#3a4d62' }}>{p.company_name}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '11px 16px', textAlign: 'right', verticalAlign: 'middle', fontFamily: 'var(--mono)', fontSize: 12, color: '#dde4ef' }}>{p.shares}</td>
                        <td style={{ padding: '11px 16px', textAlign: 'right', verticalAlign: 'middle', fontFamily: 'var(--mono)', fontSize: 12, color: '#dde4ef' }}>${fmt2(p.avg_cost)}</td>
                        <td
                          style={{ padding: '11px 16px', textAlign: 'right', verticalAlign: 'middle', fontFamily: 'var(--mono)', fontSize: 12, color: '#dde4ef', transition: 'color 0.2s' }}
                          className={priceTicks[p.ticker] === 'up' ? 'price-flash-up' : priceTicks[p.ticker] === 'down' ? 'price-flash-down' : ''}
                        >
                          {priceTicks[p.ticker] && (
                            <span style={{ fontSize: 9, marginRight: 3, color: priceTicks[p.ticker] === 'up' ? '#00d4a1' : '#f04361' }}>
                              {priceTicks[p.ticker] === 'up' ? '▲' : '▼'}
                            </span>
                          )}
                          ${fmt2(p.currentPrice)}
                        </td>
                        <td style={{ padding: '11px 16px', textAlign: 'right', verticalAlign: 'middle', fontFamily: 'var(--mono)', fontSize: 12, color: '#dde4ef' }}>${fmt2(p.currentValue)}</td>
                        <td style={{ padding: '11px 16px', textAlign: 'right', verticalAlign: 'middle' }}>
                          <Badge up={posUp}>{posUp ? '+' : ''}${fmt2(Math.abs(p.unrealisedPnl))}</Badge>
                        </td>
                        <td style={{ padding: '11px 16px', textAlign: 'right', verticalAlign: 'middle' }}>
                          <Badge up={posUp}>{posUp ? '+' : ''}{p.unrealisedPnlPercent.toFixed(2)}%</Badge>
                        </td>
                        <td style={{ padding: '11px 20px 11px 20px', textAlign: 'left', verticalAlign: 'middle' }}>
                          <PositionProgressBar position={p} />
                        </td>
                        <td style={{ padding: '11px 16px', textAlign: 'right', verticalAlign: 'middle', fontFamily: 'var(--mono)', fontSize: 12, color: '#3a4d62' }}>
                          {weight.toFixed(1)}%
                        </td>
                        <td style={{ padding: '11px 16px', textAlign: 'right', verticalAlign: 'middle' }}>
                          <CopyButton onClick={() => setCopyModal({ ticker: p.ticker, shares: p.shares, price: p.currentPrice })} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Bottom Row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>

          {/* AI Briefing */}
          <div style={CARD}>
            <div style={CARD_HDR}>
              <span style={CT}>AI Briefing — Day {briefingsCount}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'rgba(79,138,239,0.12)', color: '#4f8aef' }}>
                  ⚡ Marcus Webb
                </span>
                {latestBriefing && (
                  <span style={{ fontSize: 10, color: '#3a4d62' }}>
                    {new Date(latestBriefing.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {latestBriefing ? (
                <>
                  <p className={briefingExpanded ? '' : 'line-clamp-6'} style={{ fontSize: 12, lineHeight: 1.78, color: '#7c8fa8', whiteSpace: 'pre-line', margin: 0 }}>
                    {tradingPart}
                  </p>
                  <button onClick={() => setBriefingExpanded(v => !v)} style={{ alignSelf: 'flex-start', fontSize: 11, color: '#7c8fa8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#3a4d62', textUnderlineOffset: 2, padding: 0 }}>
                    {briefingExpanded ? 'Show less' : 'Read full briefing'}
                  </button>
                </>
              ) : (
                <p style={{ fontSize: 12, color: '#3a4d62', textAlign: 'center', padding: '32px 0', margin: 0 }}>
                  Run Marcus to get your first briefing.
                </p>
              )}
            </div>
          </div>

          {/* Recent Trades + Watchlist */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
            <div style={CARD_HDR}>
              <span style={CT}>Recent Trades</span>
              <Link href="/dashboard/trades" style={{ fontSize: 10, color: '#3a4d62', textDecoration: 'none' }}>
                View all →
              </Link>
            </div>

            {trades.length === 0 ? (
              <div style={{ padding: '32px 18px', textAlign: 'center', fontSize: 12, color: '#3a4d62' }}>No trades yet.</div>
            ) : (
              trades.slice(0, 5).map(t => {
                const isBuy = t.action === 'BUY'
                return (
                  <div key={t.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 11, cursor: 'default' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.015)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '' }}
                  >
                    <span style={{ color: '#3a4d62', width: 46, flexShrink: 0, fontSize: 10 }}>
                      {new Date(t.executed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4, flexShrink: 0, background: isBuy ? 'rgba(0,212,161,0.12)' : 'rgba(240,67,97,0.12)', color: isBuy ? '#00d4a1' : '#f04361' }}>
                      {t.action}
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: '#dde4ef', width: 42, flexShrink: 0, fontSize: 12 }}>
                      {t.ticker}
                    </span>
                    <span style={{ color: '#3a4d62', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>
                      {t.shares}×${fmt2(t.price)} · {t.reasoning?.slice(0, 60)}
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', color: '#7c8fa8', flexShrink: 0, fontSize: 11 }}>
                      ${fmt2(t.total_value)}
                    </span>
                  </div>
                )
              })
            )}

            {/* Watchlist */}
            <div style={{ marginTop: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 18px', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                <span style={CT}>Watchlist — Next Entries</span>
                <span style={{ fontSize: 10, color: '#3a4d62' }}>
                  {latestBriefing?.watchlist?.length ?? 0} candidates
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 18px 14px' }}>
                {(latestBriefing?.watchlist ?? []).map(ticker => (
                  <Link key={ticker} href={`/analysis/${ticker}`}
                    style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 5, background: 'rgba(255,255,255,0.04)', color: '#7c8fa8', border: '1px solid rgba(255,255,255,0.07)', textDecoration: 'none', transition: 'all 0.15s' }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.background = 'rgba(79,138,239,0.12)'; el.style.color = '#4f8aef'; el.style.borderColor = '#4f8aef' }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.background = 'rgba(255,255,255,0.04)'; el.style.color = '#7c8fa8'; el.style.borderColor = 'rgba(255,255,255,0.07)' }}
                  >
                    {ticker}
                  </Link>
                ))}
                {(!latestBriefing?.watchlist || latestBriefing.watchlist.length === 0) && (
                  <span style={{ fontSize: 11, color: '#3a4d62' }}>Run Marcus to see watchlist.</span>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Status Bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '0 20px', height: 30,
        background: 'rgba(8,11,22,0.85)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        fontSize: 10, color: '#3a4d62',
        flexShrink: 0,
        position: 'sticky', bottom: 0, zIndex: 100,
      }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: isMarketOpen ? '#00d4a1' : '#3a4d62', boxShadow: isMarketOpen ? '0 0 7px #00d4a1' : 'none', flexShrink: 0 }} />
        <span style={{ color: isMarketOpen ? '#00d4a1' : '#7c8fa8' }}>{isMarketOpen ? 'Market Open' : 'Market Closed'}</span>
        <span>NYSE &nbsp;·&nbsp; NASDAQ</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{clock}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span>Prices via Yahoo Finance &nbsp;·&nbsp; Macro via FRED</span>
          <span>Next auto-run: tomorrow 15:45 CET</span>
          {latestBriefing && (
            <span>Last run: {lastRunDate} &nbsp;·&nbsp; Day {briefingsCount}</span>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 48, right: 24, zIndex: 600, background: '#00d4a1', color: '#031a12', fontSize: 12, fontWeight: 700, padding: '10px 18px', borderRadius: 8, boxShadow: '0 4px 24px rgba(0,212,161,0.35)' }}>
          {toast}
        </div>
      )}

      {/* Copy Modal */}
      {copyModal && (
        <CopyModal
          ticker={copyModal.ticker}
          shares={copyModal.shares}
          price={copyModal.price}
          onClose={() => setCopyModal(null)}
        />
      )}

    </div>
  )
}
