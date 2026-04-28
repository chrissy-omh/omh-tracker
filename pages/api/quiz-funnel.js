import { getBigQueryClient } from '../../lib/bigquery'

const VALID_TYPES = ['all', 'ostrich', 'swan', 'puffin', 'owl']

const FUNNEL_SLUG = {
  ostrich: 'quiz-fgh-ost',
  swan: 'quiz-fgh-swa',
  puffin: 'quiz-fgh-puf',
  owl: 'quiz-fgh-owl',
}

const HUB_SLUG = {
  ostrich: 'ostrich-hub',
  swan: 'swan-hub',
  puffin: 'puffin-hub',
  owl: 'owl-hub',
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

function toNum(v) {
  if (v == null) return 0
  if (typeof v === 'object' && 'value' in v) return Number(v.value)
  return Number(v)
}

function toStr(v) {
  if (v == null) return ''
  if (typeof v === 'object' && 'value' in v) return String(v.value)
  return String(v)
}

function classifyReferrer(ref) {
  if (!ref) return 'Direct'
  const r = ref.toLowerCase()
  if (r.includes('google')) return 'Google'
  if (r.includes('facebook.com')) return 'Facebook'
  if (r.includes('instagram.com')) return 'Instagram'
  if (r.includes('pinterest.com')) return 'Pinterest'
  return 'Other'
}

const ALL_FUNNEL_URLS = `(url LIKE '%quiz-fgh-ost%' OR url LIKE '%quiz-fgh-swa%' OR url LIKE '%quiz-fgh-puf%' OR url LIKE '%quiz-fgh-owl%')`
const ALL_HUB_URLS = `(url LIKE '%ostrich-hub%' OR url LIKE '%swan-hub%' OR url LIKE '%puffin-hub%' OR url LIKE '%owl-hub%')`

function funnelUrlWhere(type) {
  return type !== 'all' ? `url LIKE '%${FUNNEL_SLUG[type]}%'` : ALL_FUNNEL_URLS
}

function hubUrlWhere(type) {
  return type !== 'all' ? `url LIKE '%${HUB_SLUG[type]}%'` : ALL_HUB_URLS
}

async function fetchData(from, to, type) {
  const bq = getBigQueryClient()
  const ds = process.env.BIGQUERY_DATASET
  const tbl = process.env.BIGQUERY_TABLE
  const params = { from, to }

  const [[summaryRows], [noThanksRows], [journeyRows]] = await Promise.all([

    // 1. Funnel summary counts — always all types
    bq.query({
      query: `
        SELECT
          COUNT(DISTINCT CASE WHEN url LIKE '%homebird-quiz%' THEN session_id END) AS quiz_starts,
          COUNT(DISTINCT CASE WHEN url LIKE '%quiz-fgh-ost%' THEN session_id END) AS ost,
          COUNT(DISTINCT CASE WHEN url LIKE '%quiz-fgh-swa%' THEN session_id END) AS swa,
          COUNT(DISTINCT CASE WHEN url LIKE '%quiz-fgh-puf%' THEN session_id END) AS puf,
          COUNT(DISTINCT CASE WHEN url LIKE '%quiz-fgh-owl%' THEN session_id END) AS owl
        FROM \`${ds}.${tbl}\`
        WHERE DATE(timestamp) BETWEEN @from AND @to
          AND session_id IS NOT NULL
      `,
      params,
    }),

    // 2. No-thanks counts by type (hub page visited after quiz-fgh in same session)
    bq.query({
      query: `
        WITH funnel_sessions AS (
          SELECT session_id,
            CASE
              WHEN url LIKE '%quiz-fgh-ost%' THEN 'ostrich'
              WHEN url LIKE '%quiz-fgh-swa%' THEN 'swan'
              WHEN url LIKE '%quiz-fgh-puf%' THEN 'puffin'
              WHEN url LIKE '%quiz-fgh-owl%' THEN 'owl'
            END AS type,
            MIN(timestamp) AS first_ts
          FROM \`${ds}.${tbl}\`
          WHERE DATE(timestamp) BETWEEN @from AND @to
            AND session_id IS NOT NULL
            AND ${ALL_FUNNEL_URLS}
          GROUP BY session_id, type
        ),
        hub_sessions AS (
          SELECT session_id,
            CASE
              WHEN url LIKE '%ostrich-hub%' THEN 'ostrich'
              WHEN url LIKE '%swan-hub%' THEN 'swan'
              WHEN url LIKE '%puffin-hub%' THEN 'puffin'
              WHEN url LIKE '%owl-hub%' THEN 'owl'
            END AS type,
            MIN(timestamp) AS first_ts
          FROM \`${ds}.${tbl}\`
          WHERE DATE(timestamp) BETWEEN @from AND @to
            AND session_id IS NOT NULL
            AND ${ALL_HUB_URLS}
          GROUP BY session_id, type
        ),
        no_thanks AS (
          SELECT DISTINCT f.session_id, f.type
          FROM funnel_sessions f
          JOIN hub_sessions h
            ON h.session_id = f.session_id
            AND h.type = f.type
            AND h.first_ts > f.first_ts
        )
        SELECT
          COUNTIF(type = 'ostrich') AS ostrich,
          COUNTIF(type = 'swan') AS swan,
          COUNTIF(type = 'puffin') AS puffin,
          COUNTIF(type = 'owl') AS owl
        FROM no_thanks
      `,
      params,
    }),

    // 3. No-thanks journeys — filtered by type, with pages visited after hub
    bq.query({
      query: `
        WITH funnel_sessions AS (
          SELECT session_id,
            CASE
              WHEN url LIKE '%quiz-fgh-ost%' THEN 'ostrich'
              WHEN url LIKE '%quiz-fgh-swa%' THEN 'swan'
              WHEN url LIKE '%quiz-fgh-puf%' THEN 'puffin'
              WHEN url LIKE '%quiz-fgh-owl%' THEN 'owl'
            END AS type,
            MIN(timestamp) AS first_optin_ts
          FROM \`${ds}.${tbl}\`
          WHERE DATE(timestamp) BETWEEN @from AND @to
            AND session_id IS NOT NULL
            AND ${funnelUrlWhere(type)}
          GROUP BY session_id, type
        ),
        hub_sessions AS (
          SELECT session_id,
            CASE
              WHEN url LIKE '%ostrich-hub%' THEN 'ostrich'
              WHEN url LIKE '%swan-hub%' THEN 'swan'
              WHEN url LIKE '%puffin-hub%' THEN 'puffin'
              WHEN url LIKE '%owl-hub%' THEN 'owl'
            END AS type,
            MIN(timestamp) AS first_hub_ts
          FROM \`${ds}.${tbl}\`
          WHERE DATE(timestamp) BETWEEN @from AND @to
            AND session_id IS NOT NULL
            AND ${hubUrlWhere(type)}
          GROUP BY session_id, type
        ),
        no_thanks_sessions AS (
          SELECT session_id, type, first_hub_ts FROM (
            SELECT
              f.session_id, f.type, h.first_hub_ts,
              ROW_NUMBER() OVER (PARTITION BY f.session_id ORDER BY h.first_hub_ts) AS rn
            FROM funnel_sessions f
            JOIN hub_sessions h
              ON h.session_id = f.session_id
              AND h.type = f.type
              AND h.first_hub_ts > f.first_optin_ts
          ) WHERE rn = 1
        ),
        session_pages AS (
          SELECT t.session_id, t.url, t.timestamp, t.dwell_seconds, t.referrer
          FROM \`${ds}.${tbl}\` t
          INNER JOIN no_thanks_sessions n ON n.session_id = t.session_id
          WHERE DATE(t.timestamp) BETWEEN @from AND @to
        ),
        session_agg AS (
          SELECT
            session_id,
            ARRAY_AGG(referrer ORDER BY timestamp LIMIT 1)[SAFE_OFFSET(0)] AS first_referrer,
            SUM(COALESCE(dwell_seconds, 0)) AS total_duration
          FROM session_pages
          GROUP BY session_id
        ),
        pages_after AS (
          SELECT sp.session_id,
            STRING_AGG(sp.url, ' → ' ORDER BY sp.timestamp) AS path
          FROM session_pages sp
          JOIN no_thanks_sessions n
            ON n.session_id = sp.session_id
            AND sp.timestamp > n.first_hub_ts
          GROUP BY sp.session_id
        )
        SELECT
          n.type,
          sa.first_referrer,
          COALESCE(pa.path, '') AS pages_after_hub,
          COALESCE(sa.total_duration, 0) AS total_duration
        FROM no_thanks_sessions n
        JOIN session_agg sa ON sa.session_id = n.session_id
        LEFT JOIN pages_after pa ON pa.session_id = n.session_id
        ORDER BY n.first_hub_ts DESC
        LIMIT 50
      `,
      params,
    }),
  ])

  const s = summaryRows[0] ?? {}
  const optins_by_type = {
    ostrich: toNum(s.ost),
    swan: toNum(s.swa),
    puffin: toNum(s.puf),
    owl: toNum(s.owl),
  }

  const nt = noThanksRows[0] ?? {}
  const no_thanks_by_type = {
    ostrich: toNum(nt.ostrich),
    swan: toNum(nt.swan),
    puffin: toNum(nt.puffin),
    owl: toNum(nt.owl),
  }

  return {
    quiz_starts: toNum(s.quiz_starts),
    optins_total: Object.values(optins_by_type).reduce((a, b) => a + b, 0),
    optins_by_type,
    no_thanks_by_type,
    no_thanks_journeys: journeyRows.map((r) => ({
      type: toStr(r.type),
      source: classifyReferrer(toStr(r.first_referrer)),
      pages_after_hub: toStr(r.pages_after_hub),
      total_duration: toNum(r.total_duration),
    })),
  }
}

function stubData() {
  return {
    quiz_starts: 0,
    optins_total: 0,
    optins_by_type: { ostrich: 0, swan: 0, puffin: 0, owl: 0 },
    no_thanks_by_type: { ostrich: 0, swan: 0, puffin: 0, owl: 0 },
    no_thanks_journeys: [],
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const today = new Date().toISOString().split('T')[0]
  const from = isValidDate(req.query.from) ? req.query.from : today
  const to = isValidDate(req.query.to) ? req.query.to : today
  const type = VALID_TYPES.includes(req.query.type) ? req.query.type : 'all'

  try {
    const data = bigQueryConfigured() ? await fetchData(from, to, type) : stubData()
    return res.status(200).json(data)
  } catch (err) {
    console.error('quiz-funnel error', err)
    return res.status(200).json(stubData())
  }
}
