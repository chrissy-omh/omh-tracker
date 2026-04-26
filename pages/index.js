import { createHmac } from 'crypto'
import { useState } from 'react'
import { Layout, Card } from '../components/shared'

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

function Dashboard() {
  async function handleLogout() {
    await fetch('/api/auth', { method: 'DELETE' })
    window.location.reload()
  }

  return (
    <Layout title="OMH Tracker">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">Dashboard</h2>
        <button
          onClick={handleLogout}
          className="text-xs text-gray-400 hover:text-white"
        >
          Sign out
        </button>
      </div>
      <Card>
        <p className="text-sm text-gray-400">
          Welcome to OMH Tracker. Add your data sources and tabs here.
        </p>
      </Card>
    </Layout>
  )
}

export default function Home({ authenticated }) {
  return authenticated ? <Dashboard /> : <LoginForm />
}
