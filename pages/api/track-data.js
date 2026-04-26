import { getBigQueryClient } from '../../lib/bigquery'
import { memoryStore } from '../../lib/store'

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

function toNum(v) {
  if (v == null) return 0
  if (typeof v === 'object' && 'value' in v) return Number(v.value)
  return Number(v)
}

async function getBigQueryAnalytics(from, to) {
  const bq = getBigQueryClient()
  const ds = process.env.BIGQUERY_DATASET
  const tbl = process.env.BIGQUERY_TABLE
  const params = { from, to }

  const [[summaryRows], [dailyRows], [topRows]] = await Promise.all([
    bq.query({
      query: `
        SELECT
          COUNT(*) AS pageviews,
          COUNT(DISTINCT session_id) AS sessions,
          ROUND(AVG(NULLIF(dwell_seconds, 0)), 1) AS avg_dwell
        FROM \`${ds}.${tbl}\`
        WHERE DATE(timestamp) >= @from AND DATE(timestamp) <= @to
      `,
      params,
    }),
    bq.query({
      query: `
        SELECT
          FORMAT_DATE('%Y-%m-%d', DATE(timestamp)) AS date,
          COUNT(*) AS views
        FROM \`${ds}.${tbl}\`
        WHERE DATE(timestamp) >= @from AND DATE(timestamp) <= @to
        GROUP BY date
        ORDER BY date ASC
      `,
      params,
    }),
    bq.query({
      query: `
        SELECT
          COALESCE(page_title, '') AS page_title,
          url,
          COUNT(*) AS views,
          ROUND(AVG(NULLIF(dwell_seconds, 0)), 1) AS avg_dwell
        FROM \`${ds}.${tbl}\`
        WHERE DATE(timestamp) >= @from AND DATE(timestamp) <= @to
        GROUP BY page_title, url
        ORDER BY views DESC
        LIMIT 50
      `,
      params,
    }),
  ])

  const s = summaryRows[0] ?? {}
  const pageviews = toNum(s.pageviews)
  const sessions = toNum(s.sessions)
  const avg_dwell = toNum(s.avg_dwell)
  const pages_per_session =
    sessions > 0 ? Math.round((pageviews / sessions) * 10) / 10 : 0

  return {
    summary: { pageviews, sessions, pages_per_session, avg_dwell },
    daily: dailyRows.map((r) => ({ date: r.date, views: toNum(r.views) })),
    top_pages: topRows.map((r) => ({
      page_title: r.page_title || '—',
      url: r.url,
      views: toNum(r.views),
      avg_dwell: toNum(r.avg_dwell),
    })),
  }
}

function getMemoryAnalytics(from, to) {
  const fromTs = new Date(from + 'T00:00:00Z')
  const toTs = new Date(to + 'T23:59:59Z')

  const rows = memoryStore.filter((r) => {
    const ts = new Date(r.timestamp)
    return ts >= fromTs && ts <= toTs
  })

  const pageviews = rows.length
  const sessions = new Set(rows.map((r) => r.session_id).filter(Boolean)).size
  const dwellRows = rows.filter((r) => r.dwell_seconds > 0)
  const avg_dwell =
    dwellRows.length > 0
      ? Math.round(
          (dwellRows.reduce((s, r) => s + r.dwell_seconds, 0) / dwellRows.length) * 10
        ) / 10
      : 0
  const pages_per_session =
    sessions > 0 ? Math.round((pageviews / sessions) * 10) / 10 : 0

  const dailyMap = {}
  rows.forEach((r) => {
    const d = new Date(r.timestamp).toISOString().split('T')[0]
    dailyMap[d] = (dailyMap[d] ?? 0) + 1
  })
  const daily = Object.entries(dailyMap)
    .map(([date, views]) => ({ date, views }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const pageMap = {}
  rows.forEach((r) => {
    if (!pageMap[r.url])
      pageMap[r.url] = { page_title: r.page_title || '—', url: r.url, views: 0, dwell_sum: 0, dwell_count: 0 }
    pageMap[r.url].views++
    if (r.dwell_seconds > 0) {
      pageMap[r.url].dwell_sum += r.dwell_seconds
      pageMap[r.url].dwell_count++
    }
  })
  const top_pages = Object.values(pageMap)
    .map((p) => ({
      page_title: p.page_title,
      url: p.url,
      views: p.views,
      avg_dwell: p.dwell_count > 0 ? Math.round((p.dwell_sum / p.dwell_count) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 50)

  return { summary: { pageviews, sessions, pages_per_session, avg_dwell }, daily, top_pages }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const today = new Date().toISOString().split('T')[0]
  const from = isValidDate(req.query.from) ? req.query.from : today
  const to = isValidDate(req.query.to) ? req.query.to : today

  try {
    const data = bigQueryConfigured()
      ? await getBigQueryAnalytics(from, to)
      : getMemoryAnalytics(from, to)
    return res.status(200).json(data)
  } catch {
    return res.status(200).json(getMemoryAnalytics(from, to))
  }
}
