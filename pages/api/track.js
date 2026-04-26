import { getBigQueryClient } from '../../lib/bigquery'
import { memoryStore } from '../../lib/store'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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
  const table = bq.dataset(process.env.BIGQUERY_DATASET).table(process.env.BIGQUERY_TABLE)
  await table.insert([row])
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

  const { url, impressions } = req.body ?? {}

  try {
    const row = { url, impressions, timestamp: new Date().toISOString() }

    if (bigQueryConfigured()) {
      await logToBigQuery(row)
    } else {
      memoryStore.push(row)
    }

    return res.status(200).json({ success: true })
  } catch {
    return res.status(200).json({ success: false })
  }
}
