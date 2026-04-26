import { getBigQueryClient } from '../../lib/bigquery'
import { memoryStore } from '../../lib/store'

function bigQueryConfigured() {
  return !!(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON &&
    process.env.BIGQUERY_DATASET &&
    process.env.BIGQUERY_TABLE
  )
}

function toNum(v) {
  if (v == null) return 0
  if (typeof v === 'object' && 'value' in v) return Number(v.value)
  return Number(v)
}

async function getBigQueryAnalytics() {
  const bq = getBigQueryClient()
  const ds = process.env.BIGQUERY_DATASET
  const tbl = process.env.BIGQUERY_TABLE

  const [[summaryRows], [dailyRows], [topRows]] = await Promise.all([
    bq.query({
      query: `
        SELECT
          COUNT(*) AS pageviews,
          COUNT(DISTINCT session_id) AS sessions,
          ROUND(AVG(NULLIF(dwell_seconds, 0)), 1) AS avg_dwell
        FROM \`${ds}.${tbl}\`
        WHERE DATE(timestamp) = CURRENT_DATE()
      `,
    }),
    bq.query({
      query: `
        SELECT
          FORMAT_DATE('%Y-%m-%d', DATE(timestamp)) AS date,
          COUNT(*) AS views
        FROM \`${ds}.${tbl}\`
        WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
        GROUP BY date
        ORDER BY date ASC
      `,
    }),
    bq.query({
      query: `
        SELECT
          COALESCE(page_title, '') AS page_title,
          url,
          COUNT(*) AS views,
          ROUND(AVG(NULLIF(dwell_seconds, 0)), 1) AS avg_dwell
        FROM \`${ds}.${tbl}\`
        WHERE DATE(timestamp) = CURRENT_DATE()
        GROUP BY page_title, url
        ORDER BY views DESC
        LIMIT 50
      `,
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

function getMemoryAnalytics() {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)

  const todayRows = memoryStore.filter(
    (r) => new Date(r.timestamp).toISOString().split('T')[0] === todayStr
  )

  const pageviews = todayRows.length
  const sessions = new Set(todayRows.map((r) => r.session_id).filter(Boolean)).size
  const dwellRows = todayRows.filter((r) => r.dwell_seconds > 0)
  const avg_dwell =
    dwellRows.length > 0
      ? Math.round(
          (dwellRows.reduce((s, r) => s + r.dwell_seconds, 0) / dwellRows.length) * 10
        ) / 10
      : 0
  const pages_per_session =
    sessions > 0 ? Math.round((pageviews / sessions) * 10) / 10 : 0

  const dailyMap = {}
  memoryStore.forEach((r) => {
    const ts = new Date(r.timestamp)
    if (ts >= sevenDaysAgo) {
      const d = ts.toISOString().split('T')[0]
      dailyMap[d] = (dailyMap[d] ?? 0) + 1
    }
  })
  const daily = Object.entries(dailyMap)
    .map(([date, views]) => ({ date, views }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const pageMap = {}
  todayRows.forEach((r) => {
    const key = r.url
    if (!pageMap[key])
      pageMap[key] = { page_title: r.page_title || '—', url: r.url, views: 0, dwell_sum: 0, dwell_count: 0 }
    pageMap[key].views++
    if (r.dwell_seconds > 0) {
      pageMap[key].dwell_sum += r.dwell_seconds
      pageMap[key].dwell_count++
    }
  })
  const top_pages = Object.values(pageMap)
    .map((p) => ({
      page_title: p.page_title,
      url: p.url,
      views: p.views,
      avg_dwell:
        p.dwell_count > 0 ? Math.round((p.dwell_sum / p.dwell_count) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 50)

  return { summary: { pageviews, sessions, pages_per_session, avg_dwell }, daily, top_pages }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const data = bigQueryConfigured() ? await getBigQueryAnalytics() : getMemoryAnalytics()
    return res.status(200).json(data)
  } catch {
    return res.status(200).json(getMemoryAnalytics())
  }
}
