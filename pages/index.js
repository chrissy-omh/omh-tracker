import { createHmac } from 'crypto'
import { useState, useEffect } from 'react'
import { Layout, Card, Spinner } from '../components/shared'

const TABS = [
  { id: 'analytics', label: 'Analytics' },
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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-white text-center mb-6">
          OMH Tracker
        </h1>
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                autoFocus
                required
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
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
      <p className="text-xs text-gray-400 mb-2">{label}</p>
      <p className="text-2xl font-semibold text-white">{value}</p>
    </Card>
  )
}

function BarChart({ daily }) {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const match = daily.find((r) => r.date === dateStr)
    days.push({
      date: dateStr,
      views: match ? match.views : 0,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    })
  }

  const maxViews = Math.max(...days.map((d) => d.views), 1)
  const W = 560
  const H = 120
  const LABEL_H = 28
  const slotW = W / 7

  return (
    <svg
      viewBox={`0 0 ${W} ${H + LABEL_H}`}
      className="w-full"
      style={{ display: 'block' }}
    >
      {days.map((day, i) => {
        const bw = slotW * 0.6
        const bx = i * slotW + (slotW - bw) / 2
        const barH = day.views > 0 ? Math.max((day.views / maxViews) * H, 4) : 0
        const by = H - barH
        return (
          <g key={day.date}>
            <rect x={bx} y={by} width={bw} height={barH} fill="#3b82f6" rx="2" />
            <text
              x={i * slotW + slotW / 2}
              y={H + 18}
              textAnchor="middle"
              fill="#6b7280"
              fontSize="11"
              fontFamily="system-ui,sans-serif"
            >
              {day.label}
            </text>
            {day.views > 0 && (
              <text
                x={i * slotW + slotW / 2}
                y={by - 5}
                textAnchor="middle"
                fill="#9ca3af"
                fontSize="11"
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

function AnalyticsTab() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch('/api/track-data?period=today')
      .then((r) => {
        if (!r.ok) throw new Error(r.status)
        return r.json()
      })
      .then((d) => setData(d))
      .catch(() =>
        setData({ summary: { pageviews: 0, sessions: 0, pages_per_session: 0, avg_dwell: 0 }, daily: [], top_pages: [] })
      )
  }, [])

  if (!data) return <Spinner />

  const { summary, daily, top_pages } = data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Page Views Today" value={summary.pageviews} />
        <StatCard label="Sessions Today" value={summary.sessions} />
        <StatCard label="Pages / Session" value={summary.pages_per_session} />
        <StatCard label="Avg Dwell (s)" value={summary.avg_dwell} />
      </div>

      <Card>
        <p className="text-xs font-medium text-gray-400 mb-4">Daily Views — Last 7 Days</p>
        <BarChart daily={daily} />
      </Card>

      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Page Title</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">URL</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Views</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Avg Dwell (s)</th>
            </tr>
          </thead>
          <tbody className="bg-gray-900">
            {top_pages.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-xs text-gray-500">
                  No data for today yet.
                </td>
              </tr>
            ) : (
              top_pages.map((row, i) => (
                <tr key={i} className="border-t border-gray-800 hover:bg-gray-800">
                  <td className="px-4 py-3 text-gray-300 text-xs">{row.page_title}</td>
                  <td className="px-4 py-3 text-gray-200 font-mono text-xs">{row.url}</td>
                  <td className="px-4 py-3 text-gray-300">{row.views}</td>
                  <td className="px-4 py-3 text-gray-300">{row.avg_dwell || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-gray-400 hover:text-white"
        >
          Sign out
        </button>
      </div>
      {activeTab === 'analytics' && <AnalyticsTab />}
    </Layout>
  )
}

export default function Home({ authenticated }) {
  return authenticated ? <Dashboard /> : <LoginForm />
}
