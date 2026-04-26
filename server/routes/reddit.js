const express = require('express')
const router = express.Router()
const { pool } = require('../db/index')
const { checkAuth, ownerOnly } = require('../middleware/auth')
const { runRedditProspector } = require('../jobs/reddit-prospector')

const VALID_STATUSES = ['pending', 'replied', 'needs_edit', 'dismissed']
const VALID_AUDIENCES = ['anti_gamification', 'pain_point', 'biohacker']

function emptyByStatus() {
  return { pending: [], replied: [], needs_edit: [], dismissed: [] }
}

function rowToItem(r) {
  return {
    id: r.id,
    kind: r.kind,
    subreddit: r.subreddit,
    thread_id: r.thread_id,
    parent_id: r.parent_id,
    thread_url: r.thread_url,
    author_handle: r.author_handle,
    title: r.title,
    body: r.body,
    posted_at: r.posted_at,
    score: r.score,
    num_comments: r.num_comments,
    audience: r.audience,
    draft_reply: r.draft_reply,
    draft_contains_pitch: r.draft_contains_pitch,
    status: r.status,
    reply_posted_at: r.reply_posted_at,
    status_changed_at: r.status_changed_at,
  }
}

router.get('/items', checkAuth, async (req, res) => {
  try {
    const days = Math.max(1, Math.min(30, parseInt(req.query.days, 10) || 7))
    const result = await pool.query(`
      SELECT id, kind, subreddit, thread_id, parent_id, thread_url, author_handle,
             title, body, posted_at, score, num_comments, audience,
             draft_reply, draft_contains_pitch, status, reply_posted_at, status_changed_at
      FROM reddit_candidates
      WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
      ORDER BY status_changed_at DESC
    `, [String(days)])

    const byStatus = emptyByStatus()
    for (const row of result.rows) {
      const it = rowToItem(row)
      if (byStatus[row.status]) byStatus[row.status].push(it)
    }
    res.json({ success: true, byStatus })
  } catch (err) {
    console.error('GET /reddit/items error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

router.patch('/items/:id', checkAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'invalid id' })

    const { status, draft_reply } = req.body || {}
    const updates = []
    const params = []
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, error: 'invalid status' })
      }
      params.push(status)
      updates.push(`status = $${params.length}`)
      if (status === 'replied') updates.push('reply_posted_at = NOW()')
    }
    if (draft_reply !== undefined) {
      params.push(String(draft_reply))
      updates.push(`draft_reply = $${params.length}`)
    }
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'nothing to update' })
    }
    updates.push('status_changed_at = NOW()')
    params.push(id)

    const result = await pool.query(
      `UPDATE reddit_candidates SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params
    )
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'not found' })
    res.json({ success: true })
  } catch (err) {
    console.error('PATCH /reddit/items/:id error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/run', checkAuth, ownerOnly, async (req, res) => {
  res.json({ success: true, message: 'Reddit Prospector run started — check back in ~60s.' })
  runRedditProspector().catch(err => console.error('Manual Reddit run failed:', err))
})

router.post('/subreddits', checkAuth, ownerOnly, async (req, res) => {
  try {
    const { name, audience, notes } = req.body || {}
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'name required' })
    }
    if (!VALID_AUDIENCES.includes(audience)) {
      return res.status(400).json({ success: false, error: 'invalid audience' })
    }
    const clean = name.trim().replace(/^r\//, '').replace(/^\/+/, '')
    await pool.query(`
      INSERT INTO reddit_subreddits (name, audience, notes)
      VALUES ($1, $2, $3)
      ON CONFLICT (name) DO UPDATE SET
        audience = EXCLUDED.audience,
        notes = COALESCE(EXCLUDED.notes, reddit_subreddits.notes),
        is_active = TRUE
    `, [clean, audience, notes || null])
    res.json({ success: true })
  } catch (err) {
    console.error('POST /reddit/subreddits error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

router.patch('/subreddits/:id', checkAuth, ownerOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'invalid id' })
    const { is_active } = req.body || {}
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ success: false, error: 'is_active boolean required' })
    }
    const result = await pool.query(
      `UPDATE reddit_subreddits SET is_active = $1 WHERE id = $2`,
      [is_active, id]
    )
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'not found' })
    res.json({ success: true })
  } catch (err) {
    console.error('PATCH /reddit/subreddits/:id error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

module.exports = router
