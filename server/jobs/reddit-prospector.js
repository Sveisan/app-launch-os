const { pool } = require('../db/index')
const config = require('../../config/app')
const fetcher = require('./reddit-fetcher')
const filters = require('./reddit-filters')
const { judgeAndDraft } = require('./reddit-judge')

async function loadActiveSubreddits() {
  const res = await pool.query(`
    SELECT id, name, audience FROM reddit_subreddits
    WHERE is_active = TRUE
    ORDER BY last_fetched_at NULLS FIRST, id ASC
  `)
  return res.rows
}

async function loadDedupSet() {
  const res = await pool.query(`SELECT thread_id FROM reddit_candidates WHERE platform = 'reddit'`)
  return new Set(res.rows.map(r => r.thread_id))
}

async function recordSubredditFetch(id, error) {
  await pool.query(
    `UPDATE reddit_subreddits SET last_fetched_at = NOW(), last_fetch_error = $1 WHERE id = $2`,
    [error || null, id]
  )
}

async function persistCandidates(rows) {
  let inserted = 0
  let duplicate = 0
  for (const r of rows) {
    const result = await pool.query(`
      INSERT INTO reddit_candidates (
        kind, platform, subreddit, thread_id, parent_id, thread_url, author_handle,
        title, body, posted_at, score, num_comments, audience,
        draft_reply, draft_contains_pitch, draft_model, draft_generated_at
      ) VALUES (
        $1, 'reddit', $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16
      )
      ON CONFLICT (platform, thread_id) DO NOTHING
      RETURNING id
    `, [
      r.kind, r.subreddit, r.thread_id, r.parent_id, r.thread_url, r.author_handle,
      r.title, r.body, r.posted_at, r.score, r.num_comments, r.audience,
      r.draft_reply, r.draft_contains_pitch, r.draft_model, r.draft_generated_at,
    ])
    if (result.rowCount > 0) inserted++
    else duplicate++
  }
  return { inserted, duplicate }
}

async function logRunSummary(s) {
  const errSample = s.errors.length
    ? ' | err: ' + s.errors.slice(0, 3).join('; ').slice(0, 200)
    : ''
  const stale = s.staleSubs.length ? ` | stale: ${s.staleSubs.join(',')}` : ''
  const msg = `Reddit: ${s.subsScanned} subs, ${s.postsSeen}/${s.postsKept} posts, ${s.commentsSeen}/${s.commentsKept} comments, ${s.judged} judged, ${s.inserted} inserted (dup ${s.duplicate}), ${s.errors.length} errors, ${s.wallMs}ms${stale}${errSample}`
  try { await pool.query('INSERT INTO scout_logs (message) VALUES ($1)', [msg]) }
  catch (err) { console.error('[reddit-prospector] log failed:', err.message) }
  return msg
}

async function runRedditProspector({ dryRun = false } = {}) {
  const start = Date.now()
  const summary = {
    subsScanned: 0,
    postsSeen: 0, postsKept: 0,
    commentsSeen: 0, commentsKept: 0,
    judged: 0, inserted: 0, duplicate: 0,
    errors: [], staleSubs: [], wallMs: 0,
  }

  const subs = await loadActiveSubreddits()
  const dedup = await loadDedupSet()

  const allCandidates = []

  for (const sub of subs) {
    summary.subsScanned++
    let postsRaw = []
    let commentsRaw = []

    try {
      postsRaw = await fetcher.fetchPosts(sub.name, { limit: 50 })
    } catch (err) {
      if (err.code === 'REDDIT_STALE_CACHE') summary.staleSubs.push(sub.name)
      summary.errors.push(`r/${sub.name} posts: ${err.message}`)
      await recordSubredditFetch(sub.id, err.message)
      if (err.code === 'REDDIT_RATE_LIMIT') {
        summary.errors.push('Rate limited — ending run')
        break
      }
      continue
    }

    try {
      commentsRaw = await fetcher.fetchComments(sub.name, { limit: 100 })
    } catch (err) {
      if (err.code === 'REDDIT_STALE_CACHE') summary.staleSubs.push(sub.name)
      summary.errors.push(`r/${sub.name} comments: ${err.message}`)
      if (err.code === 'REDDIT_RATE_LIMIT') {
        summary.errors.push('Rate limited — ending run')
        await recordSubredditFetch(sub.id, err.message)
        break
      }
    }

    summary.postsSeen += postsRaw.length
    summary.commentsSeen += commentsRaw.length

    const { kept: keptPosts } = filters.filterPosts(postsRaw, dedup)
    const { kept: keptComments } = filters.filterComments(commentsRaw, dedup)
    summary.postsKept += keptPosts.length
    summary.commentsKept += keptComments.length

    for (const p of keptPosts) {
      allCandidates.push({ ...p, audience: sub.audience })
      dedup.add(p.thread_id)
    }
    for (const c of keptComments) {
      allCandidates.push({ ...c, audience: sub.audience })
      dedup.add(c.thread_id)
    }

    await recordSubredditFetch(sub.id, null)
  }

  // Cap pre-judgment to keep Claude cost predictable; bias toward posts (higher signal).
  const cap = config.reddit.maxCandidatesPerRun * 2
  const sorted = allCandidates.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'post' ? -1 : 1
    return (b.score || 0) - (a.score || 0)
  })
  const trimmed = sorted.slice(0, cap)
  summary.judged = trimmed.length

  const drafted = await judgeAndDraft(trimmed, { model: config.reddit.judgeModel })
  // Final cap to maxCandidatesPerRun after LLM filtering.
  const final = drafted.slice(0, config.reddit.maxCandidatesPerRun)

  if (!dryRun) {
    const persistRes = await persistCandidates(final)
    summary.inserted = persistRes.inserted
    summary.duplicate = persistRes.duplicate
  } else {
    summary.inserted = 0
    summary.duplicate = 0
  }

  summary.wallMs = Date.now() - start
  if (!dryRun) await logRunSummary(summary)
  return { summary, drafted: final }
}

module.exports = {
  runRedditProspector,
  loadActiveSubreddits,
  loadDedupSet,
  persistCandidates,
}
