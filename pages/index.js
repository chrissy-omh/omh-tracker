import { createHmac } from 'crypto'
import { useState, useEffect } from 'react'
import { Layout, Card, Spinner } from '../components/shared'

const TABS = [
  { id: 'pages', label: 'Pages' },
]

const TIME_FILTERS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: 'custom', label: 'Custom' },
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

function PagesTab() {
  const [filter, setFilter] = useState('today')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let url
    if (filter === 'custom') {
      if (!customStart || !customEnd) return
      url = `/api/dashboard?filter=custom&start=${customStart}&end=${customEnd}`
    } else {
      url = `/api/dashboard?filter=${filter}`
    }

    setRows(null)
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(r.status)
        return r.json()
      })
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]))
  }, [filter, customStart, customEnd])

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex gap-1">
          {TIME_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                filter === f.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {filter === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
            />
            <span className="text-xs text-gray-500">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        )}
      </div>

      {rows === null ? (
        <Spinner />
      ) : (
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">URL</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Impressions</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Dwell (s)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Time</th>
              </tr>
            </thead>
            <tbody className="bg-gray-900">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-xs text-gray-500">
                    No tracking data for this period.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={i} className="border-t border-gray-800 hover:bg-gray-800">
                    <td className="px-4 py-3 text-gray-200 font-mono text-xs">{row.url}</td>
                    <td className="px-4 py-3 text-gray-300 text-xs">{row.page_title ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-300">{row.impressions}</td>
                    <td className="px-4 py-3 text-gray-300">{row.dwell_seconds ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {row.timestamp ? new Date(row.timestamp).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
      {activeTab === 'pages' && <PagesTab />}
    </Layout>
  )
}

export default function Home({ authenticated }) {
  return authenticated ? <Dashboard /> : <LoginForm />
}
