import { BigQuery } from '@google-cloud/bigquery'

let client

export function getBigQueryClient() {
  if (!client) {
    client = new BigQuery({
      projectId: process.env.BIGQUERY_PROJECT_ID,
      ...(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON && {
        credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON),
      }),
    })
  }
  return client
}

export async function runQuery(sql, params = []) {
  const bq = getBigQueryClient()
  const [rows] = await bq.query({ query: sql, params })
  return rows
}
