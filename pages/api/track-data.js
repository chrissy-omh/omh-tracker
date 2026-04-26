import { getBigQueryClient } from '../../lib/bigquery'
import { memoryStore } from '../../lib/store'

function bigQueryConfigured() {
  return !!(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON &&
    process.env.BIGQUERY_DATASET &&
    process.env.BIGQUERY_TABLE
  )
}

async function queryBigQuery() {
  const bq = getBigQueryClient()
  const query = `
    SELECT url, impressions, timestamp, session_id, dwell_seconds, page_title
    FROM \`${process.env.BIGQUERY_DATASET}.${process.env.BIGQUERY_TABLE}\`
    ORDER BY timestamp DESC
    LIMIT 1000
  `
  const [rows] = await bq.query({ query })
  return rows.map((r) => ({
    url: r.url,
    impressions: r.impressions,
    timestamp: r.timestamp?.value ?? r.timestamp,
    session_id: r.session_id ?? null,
    dwell_seconds: r.dwell_seconds ?? null,
    page_title: r.page_title ?? null,
  }))
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end()
  }

  try {
    const data = bigQueryConfigured() ? await queryBigQuery() : memoryStore
    return res.status(200).json(data)
  } catch {
    return res.status(200).json(memoryStore)
  }
}
