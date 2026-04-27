import { getBigQueryClient } from '../../lib/bigquery'
import { memoryStore } from '../../lib/store'

const PAGE_SIZE = 20

const SOURCE_LABELS = {
  google: 'Google Search',
  facebook: 'Facebook',
  instagram: 'Instagram',
  pinterest: 'Pinterest',
  direct: 'Direct',
  other: 'Other',
}

function bigQueryConfigured() {
  return !!(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON &&
    process.env.BIGQUERY_DATASET &&
    process.env.BIGQUERY_TABLE
  )
}

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function classifyReferrer(ref) {
  if (!ref) return 'Direct'
  const r = ref.toLowerCase()
  if (r.includes('google')) return 'Google Search'
  if (r.includes('facebook.com')) return 'Facebook'
  if (r.includes('instagram.com')) return 'Instagram'
  if (r.includes('pinterest.com')) return 'Pinterest'
  return 'Other'
}

function buildBqSourceFilter(source) {
  switch (source) {
    case 'google':    return `LOWER(first_referrer) LIKE '%google%'`
    case 'facebook':  return `LOWER(first_referrer) LIKE '%facebook.com%'`
    case 'instagram': return `LOWER(first_referrer) LIKE '%instagram.com%'`
    case 'pinterest': return `LOWER(first_referrer) LIKE '%pinterest.com%'`
    case 'direct':    return `(first_referrer IS NULL OR first_referrer = '')`
    case 'other':     return `(first_referrer IS NOT NULL AND first_referrer != '' AND LOWER(first_referrer) NOT LIKE '%google%' AND LOWER(first_referrer) NOT LIKE '%facebook.com%' AND LOWER(first_referrer) NOT LIKE '%instagram.com%' AND LOWER(first_referrer) NOT LIKE '%pinterest.com%')`
    default:          return null
  }
}

function toStr(v) {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'object' && 'value' in v) return String(v.value)
  return String(v)
}

function toNum(v) {
  if (v == null) return 0
  if (typeof v === 'object' && 'value' in v) return Number(v.value)
  return Number(v)
}

async function getBigQueryJourneys(from, to, url, source, page) {
  const bq = getBigQueryClient()
  const ds = process.env.BIGQUERY_DATASET
  const tbl = process.env.BIGQUERY_TABLE
  const offset = (page - 1) * PAGE_SIZE

  const dateFilter = `DATE(timestamp) >= @from AND DATE(timestamp) <= @to AND session_id IS NOT NULL`
  const urlFilter = url
    ? ` AND session_id IN (SELECT DISTINCT session_id FROM \`${ds}.${tbl}\` WHERE url = @url AND DATE(timestamp) >= @from AND DATE(timestamp) <= @to)`
    : ''
  const rowFilter = dateFilter + urlFilter
  const params = url ? { from, to, url } : { from, to }

  const sourceCond = buildBqSourceFilter(source)
  const sourceWhere = sourceCond ? `WHERE ${sourceCond}` : ''

  const sessionCte = `
    WITH sessions AS (
      SELECT
        session_id,
        ARRAY_AGG(
          STRUCT(
            url AS url,
            COALESCE(page_title, '') AS page_title,
            COALESCE(dwell_seconds, 0) AS dwell_seconds,
            FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', timestamp) AS ts,
            COALESCE(exit_url, '') AS exit_url,
            COALESCE(event_type, '') AS event_type
          )
          ORDER BY timestamp ASC
        ) AS pages,
        FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', MIN(timestamp)) AS session_start,
        SUM(COALESCE(dwell_seconds, 0)) AS total_duration,
        COUNT(*) AS page_count,
        ARRAY_AGG(referrer ORDER BY timestamp ASC LIMIT 1)[SAFE_OFFSET(0)] AS first_referrer
      FROM \`${ds}.${tbl}\`
      WHERE ${rowFilter}
      GROUP BY session_id
      HAVING COUNT(*) >= 2
    )
  `

  const [[countRows], [sessionRows], [pageListRows]] = await Promise.all([
    bq.query({
      query: `
        WITH sessions AS (
          SELECT session_id,
            ARRAY_AGG(referrer ORDER BY timestamp ASC LIMIT 1)[SAFE_OFFSET(0)] AS first_referrer
          FROM \`${ds}.${tbl}\` WHERE ${rowFilter} GROUP BY session_id HAVING COUNT(*) >= 2
        )
        SELECT COUNT(*) AS total FROM sessions ${sourceWhere}
      `,
      params,
    }),
    bq.query({
      query: `
        ${sessionCte}
        SELECT * FROM sessions ${sourceWhere}
        ORDER BY session_start DESC
        LIMIT ${PAGE_SIZE} OFFSET ${offset}
      `,
      params,
    }),
    bq.query({
      query: `SELECT DISTINCT url FROM \`${ds}.${tbl}\` WHERE DATE(timestamp) >= @from AND DATE(timestamp) <= @to ORDER BY url ASC`,
      params: { from, to },
    }),
  ])

  const total = toNum(countRows[0]?.total ?? 0)
  const pages_list = pageListRows.map(r => toStr(r.url)).filter(Boolean)

  const sessions = sessionRows.map(row => ({
    session_id: toStr(row.session_id),
    source: classifyReferrer(toStr(row.first_referrer)),
    session_start: toStr(row.session_start),
    total_duration: toNum(row.total_duration),
    page_count: toNum(row.page_count),
    pages: (row.pages ?? []).map(p => ({
      url: toStr(p.url),
      page_title: toStr(p.page_title),
      dwell_seconds: toNum(p.dwell_seconds),
      timestamp: toStr(p.ts),
      exit_url: toStr(p.exit_url),
      event_type: toStr(p.event_type),
    })),
  }))

  return { sessions, total, page, pages_list }
}

function getMemoryJourneys(from, to, url, source, page) {
  const fromTs = new Date(from + 'T00:00:00Z')
  const toTs = new Date(to + 'T23:59:59Z')

  let rows = memoryStore.filter(r => {
    const ts = new Date(r.timestamp)
    return ts >= fromTs && ts <= toTs && r.session_id
  })

  if (url) {
    const sessionIds = new Set(rows.filter(r => r.url === url).map(r => r.session_id))
    rows = rows.filter(r => sessionIds.has(r.session_id))
  }

  const sessionMap = {}
  rows.forEach(r => {
    if (!sessionMap[r.session_id]) {
      sessionMap[r.session_id] = { session_id: r.session_id, pages: [], first_referrer: r.referrer || '' }
    }
    sessionMap[r.session_id].pages.push({
      url: r.url,
      page_title: r.page_title || '',
      dwell_seconds: r.dwell_seconds || 0,
      timestamp: r.timestamp,
      exit_url: r.exit_url || '',
      event_type: r.event_type || '',
    })
  })

  let allSessions = Object.values(sessionMap)
    .map(s => {
      s.pages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      return {
        session_id: s.session_id,
        source: classifyReferrer(s.first_referrer),
        session_start: s.pages[0]?.timestamp || '',
        total_duration: s.pages.reduce((sum, p) => sum + (p.dwell_seconds || 0), 0),
        page_count: s.pages.length,
        pages: s.pages,
      }
    })
    .filter(s => s.page_count >= 2)
    .sort((a, b) => new Date(b.session_start) - new Date(a.session_start))

  if (source && SOURCE_LABELS[source]) {
    const label = SOURCE_LABELS[source]
    allSessions = allSessions.filter(s => s.source === label)
  }

  const total = allSessions.length
  const paginated = allSessions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const allInRange = memoryStore.filter(r => {
    const ts = new Date(r.timestamp)
    return ts >= fromTs && ts <= toTs
  })
  const pages_list = [...new Set(allInRange.map(r => r.url))].filter(Boolean).sort()

  return { sessions: paginated, total, page, pages_list }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const today = new Date().toISOString().split('T')[0]
  const from = isValidDate(req.query.from) ? req.query.from : today
  const to = isValidDate(req.query.to) ? req.query.to : today
  const url = typeof req.query.url === 'string' && req.query.url ? req.query.url : null
  const source = typeof req.query.source === 'string' && req.query.source in SOURCE_LABELS ? req.query.source : null
  const page = Math.max(1, parseInt(req.query.page) || 1)

  try {
    const data = bigQueryConfigured()
      ? await getBigQueryJourneys(from, to, url, source, page)
      : getMemoryJourneys(from, to, url, source, page)
    return res.status(200).json(data)
  } catch {
    return res.status(200).json(getMemoryJourneys(from, to, url, source, page))
  }
}
