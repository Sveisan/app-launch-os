const express = require('express')
const router = express.Router()
const { pool } = require('../db/index')
const { sendNotification } = require('../email/index')

const REQUIRED = ['name', 'email', 'handle', 'platform', 'followers', 'niche', 'reason']

router.post('/', async (req, res) => {
  const missing = REQUIRED.filter(f => !req.body[f])
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` })
  }

  const { name, email, handle, platform, followers, niche, reason } = req.body

  try {
    await pool.query(
      `INSERT INTO contacts (name, email, handle, platform, followers, niche, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [name, email, handle, platform, followers, niche, reason]
    )
  } catch (err) {
    console.error('Creator DB error:', err.message)
    return res.status(500).json({ error: 'Internal server error' })
  }

  try {
    await sendNotification({
      subject: `New creator application — ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nHandle: ${handle}\nPlatform: ${platform}\nFollowers: ${followers}\nNiche: ${niche}\nReason: ${reason}`,
    })
  } catch (err) {
    console.error('Creator email error:', err.message)
  }

  res.json({ ok: true })
})

module.exports = router
