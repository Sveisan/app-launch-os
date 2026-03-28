const express = require('express')
const router = express.Router()
const { pool } = require('../db/index')
const { sendNotification } = require('../email/index')

router.post('/', async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email is required' })

  await pool.query('INSERT INTO waitlist (email) VALUES ($1)', [email])

  await sendNotification({
    subject: 'New Android waitlist signup',
    text: `Email: ${email}`,
  })

  res.json({ ok: true })
})

module.exports = router
