import { getBigQueryClient } from '../../lib/bigquery'
import { memoryStore } from '../../lib/store'

function bigQueryConfigured() {
  return !!(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON &&
    process.env.BIGQUERY_DATASET &&
    process.env.BIGQUERY_TABLE
  )
}

function isValidDate(str) {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str)
}

function buildFilter(filter, start, end) {
  switch (filter) {
    case '7d':
      return {
        where: 'WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)',
        params: {},
      }
    case '30d':
      return {
        where: 'WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)',
        params: {},
      }
    case 'custom':
      if (isValidDate(start) && isValidDate(end)) {
        return {
          where: 'WHERE DATE(timestamp) >= @start AND DATE(timestamp) <= @end',
          params: { start, end },
        }
      }
      // fall through to today if dates are missing/invalid
    default:
      return { where: 'WHERE DATE(timestamp) = CURRENT_DATE()', params: {} }
  }
}

async function queryBigQuery(filter, start, end) {
  const bq = getBigQueryClient()
  const { where, params } = buildFilter(filter, start, end)
  const query = `
    SELECT url, impressions, timestamp, session_id, dwell_seconds, page_title
    FROM \`${process.env.BIGQUERY_DATASET}.${process.env.BIGQUERY_TABLE}\`
    ${where}
    ORDER BY timestamp DESC
    LIMIT 1000
  `
  const [rows] = await bq.query({ query, params })
  return rows.map((r) => ({
    url: r.url,
    impressions: r.impressions,
    timestamp: r.timestamp?.value ?? r.timestamp,
    session_id: r.session_id ?? null,
    dwell_seconds: r.dwell_seconds ?? null,
    page_title: r.page_title ?? null,
  }))
}

function filterMemoryStore(filter, start, end) {
  const now = new Date()
  return memoryStore.filter((row) => {
    const ts = new Date(row.timestamp)
    if (filter === '7d') {
      return ts >= new Date(now - 7 * 24 * 60 * 60 * 1000)
    }
    if (filter === '30d') {
      return ts >= new Date(now - 30 * 24 * 60 * 60 * 1000)
    }
    if (filter === 'custom' && isValidDate(start) && isValidDate(end)) {
      const s = new Date(start)
      const e = new Date(end)
      e.setUTCHours(23, 59, 59, 999)
      return ts >= s && ts <= e
    }
    return ts.toDateString() === now.toDateString()
  })
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end()
  }

  const { filter = 'today', start, end } = req.query

  try {
    const data = bigQueryConfigured()
      ? await queryBigQuery(filter, start, end)
      : filterMemoryStore(filter, start, end)
    return res.status(200).json(data)
  } catch {
    return res.status(200).json(filterMemoryStore(filter, start, end))
  }
}
