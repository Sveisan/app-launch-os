const express = require('express')
const router = express.Router()
const { pool } = require('../db/index')
const { sendNotification } = require('../email/index')

router.post('/', async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email is required' })

  try {
    await pool.query('INSERT INTO waitlist (email) VALUES ($1)', [email])
  } catch (err) {
    console.error('Waitlist DB error:', err.message)
    return res.status(500).json({ error: 'Internal server error' })
  }

  try {
    await sendNotification({
      subject: 'New Android waitlist signup',
      text: `Email: ${email}`,
    })
  } catch (err) {
    console.error('Waitlist email error:', err.message)
  }

  res.json({ ok: true })
})

module.exports = router
