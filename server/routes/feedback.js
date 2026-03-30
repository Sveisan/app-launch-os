const express = require('express')
const router = express.Router()
const { sendNotification } = require('../email/index')

router.post('/', async (req, res) => {
  const { category, firstName, email, message, os, version, tier, ua, phone_number } = req.body

  // 1. Honeypot check (Spam protection)
  if (phone_number) {
    return res.json({ ok: true }) // Fake success to bot
  }

  if (!message) {
    return res.status(400).json({ error: 'Message is required' })
  }

  if (!category) {
    return res.status(400).json({ error: 'Category is required' })
  }

  const subject = `[${os || 'Unknown'}] [${category.toUpperCase()}] New Feedback`

  // 2. Format HTML Email
  const getBadgeColor = (cat) => {
    if (cat === 'bug') return '#E07B39' // Accent / Orange
    if (cat === 'idea') return '#52AB98' // Secondary / Green
    return '#A0A0A0' // Muted
  }

  const html = `
    <div style="background-color: #000000; color: #FFFFFF; font-family: 'Outfit', sans-serif, Arial; padding: 40px; line-height: 1.6;">
      <div style="max-width: 600px; margin: 0 auto;">
        <div style="margin-bottom: 30px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 20px;">
          <h1 style="font-weight: 300; font-size: 24px; margin: 0;">Breathe Collection</h1>
          <p style="color: #A0A0A0; font-size: 14px; margin: 5px 0 0 0;">New Feedback Report</p>
        </div>

        <div style="margin-bottom: 30px;">
          <span style="background-color: ${getBadgeColor(category)}; color: #000000; padding: 4px 12px; border-radius: 100px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">
            ${category}
          </span>
        </div>

        <div style="background-color: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 25px; margin-bottom: 30px;">
          <p style="margin: 0; font-size: 16px; white-space: pre-wrap;">${message}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #A0A0A0;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); width: 100px;">Name</td>
            <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); color: #FFFFFF;">${firstName || 'Anonymous'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); width: 100px;">Platform</td>
            <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); color: #FFFFFF;">${os || 'Unknown'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">Version</td>
            <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); color: #FFFFFF;">${version || 'Unknown'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">Tier</td>
            <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); color: #FFFFFF;">${tier || 'Unknown'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">From</td>
            <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); color: #52AB98;">${email || 'Anonymous'}</td>
          </tr>
        </table>

        ${email ? `
        <div style="margin-top: 40px; text-align: center;">
          <a href="mailto:${email}" style="background-color: #FFFFFF; color: #000000; padding: 12px 30px; border-radius: 100px; text-decoration: none; font-weight: 600; font-size: 14px;">Reply to User</a>
        </div>
        ` : ''}

        <div style="margin-top: 60px; text-align: center; font-size: 11px; color: #666;">
          <p>Sent from Breathe Collection Feedback Portal</p>
        </div>
      </div>
    </div>
  `

  try {
    await sendNotification({
      subject,
      text: message, // Fallback plain text
      html,
      reply_to: email || undefined
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('Feedback email error:', err.message)
    res.status(500).json({ error: 'Failed to send feedback' })
  }
})

module.exports = router
