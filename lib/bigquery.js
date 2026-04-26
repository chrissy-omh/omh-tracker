import { BigQuery } from '@google-cloud/bigquery'

let client

export function getBigQueryClient() {
  if (!client) {
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
    client = new BigQuery({
      projectId: credentials.project_id,
      credentials,
    })
  }
  return client
}

export async function runQuery(sql, params = []) {
  const bq = getBigQueryClient()
  const [rows] = await bq.query({ query: sql, params })
  return rows
}
