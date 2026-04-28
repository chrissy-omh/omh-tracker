import { createHmac } from 'crypto'
import { useState, useEffect } from 'react'
import { Layout, Card, Spinner } from '../components/shared'

const TABS = [
  { id: 'analytics', label: 'Analytics' },
  { id: 'journeys', label: 'Journeys' },
  { id: 'quiz-funnel', label: 'Quiz Funnel' },
]

const HOMEBIRD_TYPES = [
  { id: 'all', label: 'All' },
  { id: 'ostrich', label: 'Ostrich' },
  { id: 'swan', label: 'Swan' },
  { id: 'puffin', label: 'Puffin' },
  { id: 'owl', label: 'Owl' },
]

const FILTERS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 Days' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom Range' },
]

function makeToken() {
  return createHmac('sha256', process.env.SESSION_SECRET || 'dev-secret')
    .update(process.env.DASHBOARD_PASSWORD || '')
    .digest('hex')
}

export async function getServerSideProps({ req }) {
  const token = req.cookies?.omh_session
  const valid = !!token && token === makeToken()
  return { props: { authenticated: valid } }
}

function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

function getDateRange(filter, customFrom, customTo) {
  const today = new Date()
  const todayStr = toDateStr(today)
  if (filter === '7d') {
    const from = new Date(today)
    from.setDate(from.getDate() - 6)
    return { from: toDateStr(from), to: todayStr }
  }
  if (filter === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1)
    return { from: toDateStr(from), to: todayStr }
  }
  if (filter === 'custom') {
    return { from: customFrom, to: customTo }
  }
  return { from: todayStr, to: todayStr }
}

function LoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        window.location.reload()
      } else {
        setError('Incorrect password')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f2ec] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-[#333333] text-center mb-6">OMH Tracker</h1>
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-[#666666] mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded bg-white border border-[#e8e0d5] px-3 py-2 text-sm text-[#333333] focus:outline-none focus:border-[#61856c]"
                autoFocus
                required
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-[#61856c] hover:bg-[#4e6e59] disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <Card>
      <p className="text-xs text-[#666666] mb-2">{label}</p>
      <p className="text-2xl font-semibold text-[#333333]">{value ?? 0}</p>
    </Card>
  )
}

function BarChart({ daily, from, to }) {
  if (!from || !to) return null

  const allDays = []
  const cursor = new Date(from + 'T00:00:00Z')
  const end = new Date(to + 'T00:00:00Z')
  while (cursor <= end) {
    const dateStr = toDateStr(cursor)
    const match = daily.find((r) => r.date === dateStr)
    allDays.push({ date: dateStr, views: match ? match.views : 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  const n = allDays.length
  const maxViews = Math.max(...allDays.map((d) => d.views), 1)
  const W = 560
  const H = 120
  const LABEL_H = 28
  const slotW = W / n

  function shouldShowLabel(i) {
    if (n <= 7) return true
    if (n <= 14) return i % 2 === 0
    if (n <= 21) return i % 3 === 0
    return i % Math.ceil(n / 7) === 0 || i === n - 1
  }

  function shortLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z')
    return n <= 14
      ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
      : d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' })
  }

  return (
    <svg viewBox={`0 0 ${W} ${H + LABEL_H}`} className="w-full" style={{ display: 'block' }}>
      {allDays.map((day, i) => {
        const bw = Math.max(slotW * 0.6, 2)
        const bx = i * slotW + (slotW - bw) / 2
        const barH = day.views > 0 ? Math.max((day.views / maxViews) * H, 4) : 0
        const by = H - barH
        return (
          <g key={day.date}>
            <rect x={bx} y={by} width={bw} height={barH} fill="#eab308" rx="2" />
            {shouldShowLabel(i) && (
              <text
                x={i * slotW + slotW / 2}
                y={H + 18}
                textAnchor="middle"
                fill="#999999"
                fontSize="10"
                fontFamily="system-ui,sans-serif"
              >
                {shortLabel(day.date)}
              </text>
            )}
            {day.views > 0 && n <= 14 && (
              <text
                x={i * slotW + slotW / 2}
                y={by - 4}
                textAnchor="middle"
                fill="#aaaaaa"
                fontSize="10"
                fontFamily="system-ui,sans-serif"
              >
                {day.views}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function extractDomain(url) {
  try { return new URL(url).hostname } catch { return url }
}

function formatDateTime(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ts
  }
}

function SessionCard({ session }) {
  const { source, session_start, pages, total_duration, page_count } = session
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-[#61856c] text-white">
            {source}
          </span>
          <span className="text-xs text-[#666666]">{formatDateTime(session_start)}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#666666] shrink-0 ml-2">
          <span>{page_count} page{page_count !== 1 ? 's' : ''}</span>
          {total_duration > 0 && <span>{total_duration}s</span>}
        </div>
      </div>
      <div className="flex items-center flex-wrap gap-1.5 text-xs">
        <span className="inline-flex items-center rounded bg-[#f1d05b] px-2 py-0.5 font-medium text-[#333333]">
          {source}
        </span>
        {pages.map((p, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <span className="text-[#bbbbbb]">→</span>
            <span className={`inline-flex items-center rounded border px-2 py-0.5 ${p.event_type === 'exit_click' ? 'border-[#f1d05b] bg-[#f1d05b] font-medium text-[#333333]' : 'border-[#e8e0d5] bg-[#f7f2ec] text-[#333333]'}`}>
              {p.url}
              {p.dwell_seconds > 0 && (
                <span className="ml-1 text-[#999999]">({p.dwell_seconds}s)</span>
              )}
            </span>
            {p.exit_url && (
              <span className="inline-flex items-center gap-1">
                <span className="text-[#bbbbbb]">→</span>
                <span className="inline-flex items-center rounded border border-[#e8e0d5] bg-white px-2 py-0.5 text-[#666666]">
                  🚪 {extractDomain(p.exit_url)}
                </span>
              </span>
            )}
          </span>
        ))}
      </div>
    </Card>
  )
}

function AnalyticsTab() {
  const [activeFilter, setActiveFilter] = useState('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [data, setData] = useState(null)
  const [currentRange, setCurrentRange] = useState({ from: '', to: '' })

  useEffect(() => {
    const { from, to } = getDateRange(activeFilter, customFrom, customTo)
    if (!from || !to) return
    setData(null)
    setCurrentRange({ from, to })
    fetch(`/api/track-data?from=${from}&to=${to}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status)
        return r.json()
      })
      .then((d) => setData(d))
      .catch(() =>
        setData({ summary: { pageviews: 0, sessions: 0, pages_per_session: 0, avg_dwell: 0 }, daily: [], top_pages: [] })
      )
  }, [activeFilter, customFrom, customTo])

  const { summary = {}, daily = [], top_pages = [], sources = [] } = data ?? {}

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                activeFilter === f.id
                  ? 'bg-[#61856c] text-white'
                  : 'bg-transparent text-[#666666] hover:text-[#333333]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {activeFilter === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded bg-white border border-[#e8e0d5] px-2 py-1 text-xs text-[#333333] focus:outline-none focus:border-[#61856c]"
            />
            <span className="text-xs text-[#666666]">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded bg-white border border-[#e8e0d5] px-2 py-1 text-xs text-[#333333] focus:outline-none focus:border-[#61856c]"
            />
          </div>
        )}
      </div>

      {data === null ? (
        <Spinner />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Page Views" value={summary.pageviews} />
            <StatCard label="Sessions" value={summary.sessions} />
            <StatCard label="Pages / Session" value={summary.pages_per_session} />
            <StatCard label="Avg Dwell (s)" value={summary.avg_dwell} />
          </div>

          {/* Bar chart */}
          <Card>
            <p className="text-xs font-medium text-[#666666] mb-4">Daily Views</p>
            <BarChart daily={daily} from={currentRange.from} to={currentRange.to} />
          </Card>

          {/* Top pages */}
          <div className="rounded-lg border border-[#e8e0d5] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e8e0d5] bg-white">
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#666666]">Page Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#666666]">URL</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#666666]">Views</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#666666]">Avg Dwell (s)</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {top_pages.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-xs text-[#999999]">
                      No data for this period.
                    </td>
                  </tr>
                ) : (
                  top_pages.map((row, i) => (
                    <tr key={i} className="border-t border-[#e8e0d5] hover:bg-[#f7f2ec]">
                      <td className="px-4 py-3 text-[#333333] text-xs">{row.page_title}</td>
                      <td className="px-4 py-3 text-[#333333] font-mono text-xs">{row.url}</td>
                      <td className="px-4 py-3 text-[#333333]">{row.views}</td>
                      <td className="px-4 py-3 text-[#333333]">{row.avg_dwell || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Traffic sources */}
          <div className="rounded-lg border border-[#e8e0d5] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e8e0d5] bg-white">
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#666666]">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#666666]">Visits</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#666666]">% of Total</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {sources.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-xs text-[#999999]">
                      No data for this period.
                    </td>
                  </tr>
                ) : (
                  sources.map((row, i) => (
                    <tr key={i} className="border-t border-[#e8e0d5] hover:bg-[#f7f2ec]">
                      <td className="px-4 py-3 text-[#333333] text-xs">{row.source}</td>
                      <td className="px-4 py-3 text-[#333333]">{row.visits}</td>
                      <td className="px-4 py-3 text-[#666666] text-xs">{row.pct}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function JourneysTab() {
  const [activeFilter, setActiveFilter] = useState('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [view, setView] = useState('sessions')
  const [selectedUrl, setSelectedUrl] = useState('')
  const [selectedSource, setSelectedSource] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [pagesList, setPagesList] = useState([])

  useEffect(() => {
    const { from, to } = getDateRange(activeFilter, customFrom, customTo)
    if (!from || !to) return
    setData(null)
    const urlParam = view === 'byPage' && selectedUrl ? `&url=${encodeURIComponent(selectedUrl)}` : ''
    const sourceParam = selectedSource ? `&source=${encodeURIComponent(selectedSource)}` : ''
    fetch(`/api/journeys?from=${from}&to=${to}&page=${page}${urlParam}${sourceParam}`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(d => {
        setData(d)
        if (d.pages_list?.length) setPagesList(d.pages_list)
      })
      .catch(() => setData({ sessions: [], total: 0, page: 1, pages_list: [] }))
  }, [activeFilter, customFrom, customTo, view, selectedUrl, selectedSource, page])

  function handleFilterChange(f) { setActiveFilter(f); setPage(1) }
  function handleViewChange(v) { setView(v); setPage(1); setSelectedUrl('') }
  function handleUrlChange(u) { setSelectedUrl(u); setPage(1) }
  function handleSourceChange(s) { setSelectedSource(s); setPage(1) }

  const sessions = data?.sessions ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => handleFilterChange(f.id)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                activeFilter === f.id
                  ? 'bg-[#61856c] text-white'
                  : 'bg-transparent text-[#666666] hover:text-[#333333]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {activeFilter === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={e => { setCustomFrom(e.target.value); setPage(1) }}
              className="rounded bg-white border border-[#e8e0d5] px-2 py-1 text-xs text-[#333333] focus:outline-none focus:border-[#61856c]"
            />
            <span className="text-xs text-[#666666]">to</span>
            <input
              type="date"
              value={customTo}
              onChange={e => { setCustomTo(e.target.value); setPage(1) }}
              className="rounded bg-white border border-[#e8e0d5] px-2 py-1 text-xs text-[#333333] focus:outline-none focus:border-[#61856c]"
            />
          </div>
        )}
      </div>

      {/* View toggle */}
      <div className="flex gap-1">
        <button
          onClick={() => handleViewChange('sessions')}
          className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
            view === 'sessions' ? 'bg-[#61856c] text-white' : 'bg-transparent text-[#666666] hover:text-[#333333]'
          }`}
        >
          All Sessions
        </button>
        <button
          onClick={() => handleViewChange('byPage')}
          className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
            view === 'byPage' ? 'bg-[#61856c] text-white' : 'bg-transparent text-[#666666] hover:text-[#333333]'
          }`}
        >
          By Page
        </button>
      </div>

      {/* Source filter */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-[#666666] shrink-0">Source</label>
        <select
          value={selectedSource}
          onChange={e => handleSourceChange(e.target.value)}
          className="rounded bg-white border border-[#e8e0d5] px-2 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#61856c]"
        >
          <option value="">All Sources</option>
          <option value="google">Google Search</option>
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
          <option value="pinterest">Pinterest</option>
          <option value="direct">Direct</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* By Page URL selector */}
      {view === 'byPage' && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-[#666666] shrink-0">Filter by page</label>
          <select
            value={selectedUrl}
            onChange={e => handleUrlChange(e.target.value)}
            className="rounded bg-white border border-[#e8e0d5] px-2 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#61856c]"
          >
            <option value="">— select a page —</option>
            {pagesList.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      )}

      {/* Sessions */}
      {data === null ? (
        <Spinner />
      ) : view === 'byPage' && !selectedUrl ? (
        <p className="text-sm text-[#999999] py-8 text-center">Select a page above to see its sessions.</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-[#999999] py-8 text-center">No sessions for this period.</p>
      ) : (
        <>
          <div className="space-y-3">
            {sessions.map(s => (
              <SessionCard key={s.session_id} session={s} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-[#666666]">
                {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total} sessions
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 rounded text-xs font-medium border border-[#e8e0d5] text-[#333333] disabled:opacity-40 hover:bg-[#f0ece6]"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 rounded text-xs font-medium border border-[#e8e0d5] text-[#333333] disabled:opacity-40 hover:bg-[#f0ece6]"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FunnelDiagram({ quizStarts, optinsTotal }) {
  const W = 600
  const PAD = 24
  const STEP_H = 68
  const GAP_H = 52
  const cx = W / 2
  const s1W = W - 2 * PAD
  const convPct = quizStarts > 0 ? Math.round((optinsTotal / quizStarts) * 100) : 0
  const dropOff = Math.max(0, quizStarts - optinsTotal)
  const s2W = quizStarts > 0 ? Math.max(80, Math.round(s1W * (optinsTotal / quizStarts))) : Math.round(s1W / 2)
  const s3W = Math.max(60, Math.round(s2W * 0.55))
  const y1t = 0, y1b = STEP_H
  const y2t = y1b + GAP_H, y2b = y2t + STEP_H
  const y3t = y2b + GAP_H, y3b = y3t + STEP_H
  const FONT = 'system-ui,sans-serif'

  function pts(topW, botW, yt, yb) {
    return `${cx - topW / 2},${yt} ${cx + topW / 2},${yt} ${cx + botW / 2},${yb} ${cx - botW / 2},${yb}`
  }

  return (
    <svg viewBox={`0 0 ${W} ${y3b + 4}`} className="w-full" style={{ maxWidth: 600, display: 'block', margin: '0 auto' }}>
      <polygon points={pts(s1W, s2W, y1t, y1b)} fill="#61856c" />
      <text x={cx} y={y1t + STEP_H / 2 + 6} textAnchor="middle" fill="white" fontSize="15" fontWeight="600" fontFamily={FONT}>
        Quiz Started — {quizStarts.toLocaleString()}
      </text>

      <text x={cx} y={y1b + 18} textAnchor="middle" fill="#666666" fontSize="11" fontFamily={FONT}>
        {dropOff.toLocaleString()} dropped off
      </text>
      <text x={cx} y={y1b + 35} textAnchor="middle" fill="#d97706" fontSize="13" fontWeight="600" fontFamily={FONT}>
        {convPct}% continued to optin
      </text>

      <polygon points={pts(s2W, s3W, y2t, y2b)} fill="#61856c" />
      <text x={cx} y={y2t + STEP_H / 2 + 6} textAnchor="middle" fill="white" fontSize="15" fontWeight="600" fontFamily={FONT}>
        Opted In — {optinsTotal.toLocaleString()}
      </text>

      <text x={cx} y={y2b + GAP_H / 2 + 4} textAnchor="middle" fill="#999999" fontSize="12" fontFamily={FONT}>
        Purchase tracking coming soon
      </text>

      <polygon points={pts(s3W, s3W, y3t, y3b)} fill="#e8e0d5" />
      <text x={cx} y={y3t + STEP_H / 2 + 6} textAnchor="middle" fill="#aaaaaa" fontSize="13" fontFamily={FONT}>
        Purchased — Coming Soon
      </text>
    </svg>
  )
}

function HomebirdCards({ optinsByType, noThanksByType }) {
  const types = ['ostrich', 'swan', 'puffin', 'owl']
  const total = types.reduce((sum, t) => sum + (optinsByType[t] ?? 0), 0)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {types.map((t) => {
        const optins = optinsByType[t] ?? 0
        const noThanks = noThanksByType[t] ?? 0
        const pct = total > 0 ? Math.round((optins / total) * 100) : 0
        const barW = (optins + noThanks) > 0 ? Math.round((optins / (optins + noThanks)) * 100) : 50

        return (
          <div key={t} className="rounded-lg border border-[#e8e0d5] bg-white p-4">
            <p className="text-xs font-semibold text-[#61856c] uppercase tracking-wide mb-3">
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </p>
            <p className="text-3xl font-bold text-[#333333]">{optins}</p>
            <p className="text-xs text-[#666666] mt-0.5 mb-3">{pct}% of total optins</p>
            <p className="text-xs text-[#999999] mb-1.5">No thanks: {noThanks}</p>
            <div className="h-2 rounded-full bg-[#e8e0d5] overflow-hidden">
              <div className="h-full bg-[#61856c] rounded-full" style={{ width: `${barW}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-[#bbbbbb] mt-1">
              <span>Optin</span>
              <span>No thanks</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function QuizFunnelTab() {
  const [activeFilter, setActiveFilter] = useState('7d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [activeType, setActiveType] = useState('all')
  const [data, setData] = useState(null)

  useEffect(() => {
    const { from, to } = getDateRange(activeFilter, customFrom, customTo)
    if (!from || !to) return
    setData(null)
    fetch(`/api/quiz-funnel?from=${from}&to=${to}&type=${activeType}`)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then((d) => setData(d))
      .catch(() => setData({
        quiz_starts: 0, optins_total: 0,
        optins_by_type: { ostrich: 0, swan: 0, puffin: 0, owl: 0 },
        no_thanks_by_type: { ostrich: 0, swan: 0, puffin: 0, owl: 0 },
        no_thanks_journeys: [],
      }))
  }, [activeFilter, customFrom, customTo, activeType])

  const { quiz_starts = 0, optins_total = 0, optins_by_type = {}, no_thanks_by_type = {}, no_thanks_journeys = [] } = data ?? {}

  return (
    <div className="space-y-6">
      {/* Date filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                activeFilter === f.id ? 'bg-[#61856c] text-white' : 'bg-transparent text-[#666666] hover:text-[#333333]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {activeFilter === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded bg-white border border-[#e8e0d5] px-2 py-1 text-xs text-[#333333] focus:outline-none focus:border-[#61856c]" />
            <span className="text-xs text-[#666666]">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="rounded bg-white border border-[#e8e0d5] px-2 py-1 text-xs text-[#333333] focus:outline-none focus:border-[#61856c]" />
          </div>
        )}
      </div>

      {/* Homebird type filter */}
      <div className="flex gap-2 flex-wrap">
        {HOMEBIRD_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveType(t.id)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              activeType === t.id
                ? 'bg-[#61856c] border-[#61856c] text-white'
                : 'bg-white border-[#e8e0d5] text-[#666666] hover:border-[#61856c] hover:text-[#61856c]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {data === null ? (
        <Spinner />
      ) : (
        <>
          {/* Funnel Overview */}
          <div className="rounded-lg border border-[#e8e0d5] bg-white p-6">
            <h2 className="text-sm font-semibold text-[#333333] mb-5">Funnel Overview</h2>
            <FunnelDiagram quizStarts={quiz_starts} optinsTotal={optins_total} />
          </div>

          {/* Homebird Split */}
          <div>
            <h2 className="text-sm font-semibold text-[#333333] mb-3">Homebird Split</h2>
            <HomebirdCards optinsByType={optins_by_type} noThanksByType={no_thanks_by_type} />
          </div>

          {/* No Thanks Journeys */}
          <div>
            <h2 className="text-sm font-semibold text-[#333333] mb-3">No Thanks Journeys</h2>
            <div className="rounded-lg border border-[#e8e0d5] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e8e0d5] bg-white">
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666]">Homebird Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666]">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666]">Pages After Hub</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#666666]">Duration (s)</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {no_thanks_journeys.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-xs text-[#999999]">
                        No no-thanks sessions for this period.
                      </td>
                    </tr>
                  ) : (
                    no_thanks_journeys.map((j, i) => (
                      <tr key={i} className="border-t border-[#e8e0d5] hover:bg-[#f7f2ec]">
                        <td className="px-4 py-3">
                          <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-[#61856c] text-white capitalize">
                            {j.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#333333]">{j.source}</td>
                        <td className="px-4 py-3 text-xs text-[#333333] font-mono max-w-xs truncate">
                          {j.pages_after_hub || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#333333]">{j.total_duration || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Dashboard() {
  const [activeTab, setActiveTab] = useState(TABS[0].id)

  async function handleLogout() {
    await fetch('/api/auth', { method: 'DELETE' })
    window.location.reload()
  }

  return (
    <Layout title="OMH Tracker">
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#61856c] text-white'
                  : 'text-[#666666] hover:text-[#333333]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-[#666666] hover:text-[#333333]"
        >
          Sign out
        </button>
      </div>
      {activeTab === 'analytics' && <AnalyticsTab />}
      {activeTab === 'journeys' && <JourneysTab />}
      {activeTab === 'quiz-funnel' && <QuizFunnelTab />}
    </Layout>
  )
}

export default function Home({ authenticated }) {
  return authenticated ? <Dashboard /> : <LoginForm />
}
