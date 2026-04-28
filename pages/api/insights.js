import { getBigQueryClient } from '../../lib/bigquery'
import Anthropic from '@anthropic-ai/sdk'

const FUNNEL_SLUGS = [
  'homebird-quiz',
  'quiz-fgh-ost',
  'quiz-fgh-swa',
  'quiz-fgh-puf',
  'quiz-fgh-owl',
]

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

function toStr(v) {
  if (v == null) return ''
  if (typeof v === 'object' && 'value' in v) return String(v.value)
  return String(v)
}

function funnelLikeClause(col) {
  return FUNNEL_SLUGS.map((s) => `${col} LIKE '%${s}%'`).join(' OR ')
}

async function fetchStats() {
  const bq = getBigQueryClient()
  const ds = process.env.BIGQUERY_DATASET
  const tbl = process.env.BIGQUERY_TABLE
  const dateFilter = `DATE(timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND session_id IS NOT NULL`

  const funnelMatch = funnelLikeClause('url')
  const nextFunnelMatch = funnelLikeClause('next_url')

  const [[feeders], [sources], [highIntent]] = await Promise.all([
    // Section 1 — funnel feeders
    bq.query({
      query: `
        WITH ordered AS (
          SELECT
            session_id,
            url,
            COALESCE(page_title, '') AS page_title,
            timestamp,
            LEAD(url) OVER (PARTITION BY session_id ORDER BY timestamp) AS next_url
          FROM \`${ds}.${tbl}\`
          WHERE ${dateFilter}
        ),
        page_totals AS (
          SELECT url, COUNT(*) AS total_visits
          FROM \`${ds}.${tbl}\`
          WHERE ${dateFilter}
          GROUP BY url
        ),
        feeders AS (
          SELECT o.url, o.page_title, COUNT(*) AS funnel_entries
          FROM ordered o
          WHERE (${nextFunnelMatch})
            AND NOT (${funnelLikeClause('o.url')})
          GROUP BY o.url, o.page_title
        )
        SELECT
          f.url,
          f.page_title,
          f.funnel_entries AS visits,
          ROUND(f.funnel_entries / pt.total_visits * 100, 1) AS funnel_pct
        FROM feeders f
        JOIN page_totals pt ON pt.url = f.url
        ORDER BY f.funnel_entries DESC
        LIMIT 5
      `,
    }),

    // Section 2 — traffic sources
    bq.query({
      query: `
        WITH sessions AS (
          SELECT
            session_id,
            COUNT(*) AS page_count,
            ARRAY_AGG(referrer ORDER BY timestamp LIMIT 1)[SAFE_OFFSET(0)] AS first_referrer,
            COUNTIF(${funnelMatch}) > 0 AS hit_funnel
          FROM \`${ds}.${tbl}\`
          WHERE ${dateFilter}
          GROUP BY session_id
        )
        SELECT
          CASE
            WHEN LOWER(first_referrer) LIKE '%google%' THEN 'Google'
            WHEN LOWER(first_referrer) LIKE '%facebook.com%' THEN 'Facebook'
            WHEN LOWER(first_referrer) LIKE '%instagram.com%' THEN 'Instagram'
            WHEN LOWER(first_referrer) LIKE '%pinterest.com%' THEN 'Pinterest'
            WHEN first_referrer IS NULL OR first_referrer = '' THEN 'Direct'
            ELSE 'Other'
          END AS source,
          COUNT(*) AS visits,
          ROUND(AVG(page_count), 1) AS avg_pages,
          ROUND(COUNTIF(hit_funnel) / COUNT(*) * 100, 1) AS funnel_pct
        FROM sessions
        GROUP BY source
        ORDER BY visits DESC
      `,
    }),

    // Section 3 — high intent readers
    bq.query({
      query: `
        WITH sess AS (
          SELECT
            session_id,
            STRING_AGG(url, ' → ' ORDER BY timestamp) AS page_combo,
            COUNT(*) AS page_count,
            AVG(NULLIF(dwell_seconds, 0)) AS avg_dwell
          FROM \`${ds}.${tbl}\`
          WHERE ${dateFilter}
          GROUP BY session_id
          HAVING COUNT(*) >= 3 AND AVG(NULLIF(dwell_seconds, 0)) > 60
        )
        SELECT page_combo, COUNT(*) AS session_count
        FROM sess
        GROUP BY page_combo
        ORDER BY session_count DESC
        LIMIT 10
      `,
    }),
  ])

  return {
    feeders: feeders.map((r) => ({
      url: toStr(r.url),
      page_title: toStr(r.page_title) || toStr(r.url),
      visits: toNum(r.visits),
      funnel_pct: toNum(r.funnel_pct),
    })),
    sources: sources.map((r) => ({
      source: toStr(r.source),
      visits: toNum(r.visits),
      avg_pages: toNum(r.avg_pages),
      funnel_pct: toNum(r.funnel_pct),
    })),
    high_intent: highIntent.map((r) => ({
      page_combo: toStr(r.page_combo),
      session_count: toNum(r.session_count),
    })),
  }
}

function stubStats() {
  return {
    feeders: [],
    sources: [],
    high_intent: [],
  }
}

function buildPrompt(stats) {
  const feedersText =
    stats.feeders.length === 0
      ? 'No data available.'
      : stats.feeders
          .map(
            (r) =>
              `- "${r.page_title}" (${r.url}): ${r.visits} visits before the funnel, ${r.funnel_pct}% continued`
          )
          .join('\n')

  const sourcesText =
    stats.sources.length === 0
      ? 'No data available.'
      : stats.sources
          .map(
            (r) =>
              `- ${r.source}: ${r.visits} sessions, ${r.avg_pages} pages/session avg, ${r.funnel_pct}% hit a funnel page`
          )
          .join('\n')

  const highIntentText =
    stats.high_intent.length === 0
      ? 'No data available.'
      : stats.high_intent
          .map((r) => `- ${r.session_count} session(s): ${r.page_combo}`)
          .join('\n')

  return `You are writing for Chrissy, who runs Organise My House — a warm, practical home organisation brand. Her voice is direct, warm, British, and never uses fluff or corporate-speak. Write in plain English as if you're a smart friend giving her a quick business briefing over coffee.

Write three short summaries (2–4 sentences each) based on the data below. Each should draw a clear, actionable conclusion — not just restate the numbers.

---

SECTION 1 — CONTENT THAT DRIVES FUNNEL ENTRIES (last 7 days)
${feedersText}

Write a summary titled exactly: FUNNEL_FEEDERS

---

SECTION 2 — BEST CONVERTING TRAFFIC SOURCES (last 7 days)
${sourcesText}

Write a summary titled exactly: TRAFFIC_SOURCES

---

SECTION 3 — HIGH INTENT READERS (last 7 days)
Sessions with 3+ pages visited and average dwell over 60 seconds:
${highIntentText}

Write a summary titled exactly: HIGH_INTENT

---

Format your response as exactly three blocks, each starting with the title on its own line followed by the summary paragraph. Nothing else.`
}

async function generateSummaries(stats) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      funnel_feeders: 'Add your ANTHROPIC_API_KEY environment variable to enable AI summaries.',
      traffic_sources: 'Add your ANTHROPIC_API_KEY environment variable to enable AI summaries.',
      high_intent: 'Add your ANTHROPIC_API_KEY environment variable to enable AI summaries.',
    }
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: 'You are a concise business analyst writing plain-English summaries for a small business owner.',
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: buildPrompt(stats) }],
  })

  const text = message.content[0]?.text ?? ''

  function extractSection(key) {
    const regex = new RegExp(`${key}\\s*\\n([\\s\\S]*?)(?=\\n[A-Z_]+\\s*\\n|$)`, 'i')
    const match = text.match(regex)
    return match ? match[1].trim() : 'Summary not available.'
  }

  return {
    funnel_feeders: extractSection('FUNNEL_FEEDERS'),
    traffic_sources: extractSection('TRAFFIC_SOURCES'),
    high_intent: extractSection('HIGH_INTENT'),
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const stats = bigQueryConfigured() ? await fetchStats() : stubStats()
    const summaries = await generateSummaries(stats)
    return res.status(200).json({ stats, summaries })
  } catch (err) {
    console.error('insights error', err)
    const stats = stubStats()
    const summaries = await generateSummaries(stats).catch(() => ({
      funnel_feeders: 'Unable to generate summary.',
      traffic_sources: 'Unable to generate summary.',
      high_intent: 'Unable to generate summary.',
    }))
    return res.status(200).json({ stats, summaries, error: err.message })
  }
}
