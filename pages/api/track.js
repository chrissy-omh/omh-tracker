import { getBigQueryClient } from '../../lib/bigquery'
import { memoryStore } from '../../lib/store'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const BLOCKED_IPS = new Set(['86.22.88.10'])

const BOT_PATTERN = /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|bot|crawler|spider|scraper|curl|wget|python-requests/i

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  return (forwarded ? forwarded.split(',')[0] : req.socket?.remoteAddress ?? '').trim()
}

function isBot(req) {
  const ua = req.headers['user-agent'] ?? ''
  return BOT_PATTERN.test(ua)
}

function bigQueryConfigured() {
  return !!(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON &&
    process.env.BIGQUERY_DATASET &&
    process.env.BIGQUERY_TABLE
  )
}

async function logToBigQuery(row) {
  const bq = getBigQueryClient()
  const query = `
    INSERT INTO \`${process.env.BIGQUERY_DATASET}.${process.env.BIGQUERY_TABLE}\`
    (url, impressions, timestamp, session_id, dwell_seconds, page_title, referrer)
    VALUES (@url, @impressions, TIMESTAMP(@timestamp), @session_id, @dwell_seconds, @page_title, @referrer)
  `
  await bq.query({
    query,
    params: {
      url: row.url,
      impressions: row.impressions,
      timestamp: row.timestamp,
      session_id: row.session_id ?? null,
      dwell_seconds: row.dwell_seconds ?? null,
      page_title: row.page_title ?? null,
      referrer: row.referrer ?? null,
    },
  })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_HEADERS['Access-Control-Allow-Origin'])
  res.setHeader('Access-Control-Allow-Methods', CORS_HEADERS['Access-Control-Allow-Methods'])
  res.setHeader('Access-Control-Allow-Headers', CORS_HEADERS['Access-Control-Allow-Headers'])

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  if (isBot(req) || BLOCKED_IPS.has(clientIp(req))) {
    return res.status(200).json({ success: true })
  }

  const { url, impressions, session_id, dwell_seconds, page_title, referrer } = req.body ?? {}

  const row = {
    url,
    impressions,
    timestamp: new Date().toISOString(),
    session_id: session_id ?? null,
    dwell_seconds: dwell_seconds ?? null,
    page_title: page_title ?? null,
    referrer: referrer ?? null,
  }

  if (bigQueryConfigured()) {
    try {
      await logToBigQuery(row)
      return res.status(200).json({ success: true })
    } catch {
      memoryStore.push(row)
      return res.status(200).json({ success: true })
    }
  }

  memoryStore.push(row)
  return res.status(200).json({ success: true })
}
