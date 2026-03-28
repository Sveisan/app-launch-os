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

  await pool.query(
    `INSERT INTO contacts (name, email, handle, platform, followers, niche, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [name, email, handle, platform, followers, niche, reason]
  )

  await sendNotification({
    subject: `New creator application — ${name}`,
    text: `Name: ${name}\nEmail: ${email}\nHandle: ${handle}\nPlatform: ${platform}\nFollowers: ${followers}\nNiche: ${niche}\nReason: ${reason}`,
  })

  res.json({ ok: true })
})

module.exports = router
