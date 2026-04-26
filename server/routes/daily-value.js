const express = require('express')
const router = express.Router()
const { pool } = require('../db/index')
const { checkAuth, ownerOnly } = require('../middleware/auth')
const { runDailyValue } = require('../jobs/daily-value')
const { verify } = require('../jobs/digest-token')

const VALID_STATUSES = ['new', 'drafted', 'replied', 'skipped']
const TOKEN_FLIP_STATUSES = new Set(['replied', 'skipped'])

router.get('/items', checkAuth, async (req, res) => {
  try {
    const days = Math.max(1, Math.min(30, parseInt(req.query.days, 10) || 7))
    const result = await pool.query(`
      SELECT d.id, d.status, d.monitored_post_id, d.platform,
             d.commenter_handle, d.comment_text, d.comment_posted_at,
             d.reply_draft, d.status_changed_at,
             m.account_handle, m.caption, m.thumbnail_url, m.post_url
      FROM digest_items d
      JOIN monitored_posts m ON m.id = d.monitored_post_id
      WHERE d.created_at > NOW() - ($1 || ' days')::INTERVAL
      ORDER BY d.status_changed_at DESC
    `, [String(days)])

    const byStatus = { new: [], drafted: [], replied: [], skipped: [] }
    for (const row of result.rows) {
      const item = {
        id: row.id, status: row.status, platform: row.platform,
        commenter_handle: row.commenter_handle, comment_text: row.comment_text,
        comment_posted_at: row.comment_posted_at, reply_draft: row.reply_draft,
        post: {
          account_handle: row.account_handle, caption: row.caption,
          thumbnail_url: row.thumbnail_url, post_url: row.post_url,
        },
      }
      if (byStatus[row.status]) byStatus[row.status].push(item)
    }
    res.json({ success: true, byStatus })
  } catch (err) {
    console.error('GET /daily-value/items error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

router.patch('/items/:id', checkAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'invalid id' })

    const { status, reply_draft } = req.body || {}
    const updates = []
    const params = []
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, error: 'invalid status' })
      }
      params.push(status)
      updates.push(`status = $${params.length}`)
    }
    if (reply_draft !== undefined) {
      params.push(String(reply_draft))
      updates.push(`reply_draft = $${params.length}`)
    }
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'nothing to update' })
    }
    updates.push('status_changed_at = NOW()')
    params.push(id)

    const result = await pool.query(
      `UPDATE digest_items SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params
    )
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'not found' })
    res.json({ success: true })
  } catch (err) {
    console.error('PATCH /daily-value/items/:id error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/run', checkAuth, ownerOnly, async (req, res) => {
  res.json({ success: true, message: 'Daily Value run started — check back in ~60s.' })
  runDailyValue().catch(err => console.error('Manual Daily Value run failed:', err))
})

router.get('/items/:id/status', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const { to, token } = req.query
    if (!TOKEN_FLIP_STATUSES.has(to)) {
      return res.status(400).send('Invalid status')
    }
    const decoded = verify(token)
    if (!decoded || decoded.id !== id || decoded.status !== to) {
      return res.status(403).send('Invalid or expired link')
    }
    await pool.query(
      `UPDATE digest_items SET status = $1, status_changed_at = NOW() WHERE id = $2`,
      [to, id]
    )
    res.status(200).send(`<html><body style="font-family:sans-serif;padding:2rem;">
      Item ${id} marked as <strong>${to}</strong>. You can close this tab.
    </body></html>`)
  } catch (err) {
    console.error('GET /daily-value/items/:id/status error:', err)
    res.status(500).send('Server error')
  }
})

module.exports = router
