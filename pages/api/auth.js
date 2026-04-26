import { createHmac } from 'crypto'

function makeToken() {
  return createHmac('sha256', process.env.SESSION_SECRET || 'dev-secret')
    .update(process.env.DASHBOARD_PASSWORD || '')
    .digest('hex')
}

function cookieHeader(value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `omh_session=${value}; HttpOnly; Path=/; SameSite=Strict${secure}${maxAge !== undefined ? `; Max-Age=${maxAge}` : ''}`
}

export default function handler(req, res) {
  if (req.method === 'POST') {
    const { password } = req.body ?? {}
    if (!password || password !== process.env.DASHBOARD_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password' })
    }
    res.setHeader('Set-Cookie', cookieHeader(makeToken(), 60 * 60 * 24 * 7))
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', cookieHeader('', 0))
    return res.status(200).json({ ok: true })
  }

  res.status(405).end()
}
