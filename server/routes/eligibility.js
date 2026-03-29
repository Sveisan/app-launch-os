const express = require('express')
const router = express.Router()
const { pool } = require('../db/index')
const { sendNotification, sendEmail } = require('../email/index')
const { getFollowers } = require('../platforms/index')
const config = require('../../config/app')

const THRESHOLD = config.eligibility.followerThreshold

// Step 1: Check eligibility — no email required
// Step 2: Claim (email provided) — saves to DB and sends emails
router.post('/', async (req, res) => {
  const { handle, platform, email } = req.body
  if (!handle || !platform) {
    return res.status(400).json({ error: 'handle and platform are required' })
  }

  const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`

  // OnlyFans: auto-approve
  if (platform === 'onlyfans') {
    if (email) await saveAndNotify({ handle: cleanHandle, platform, email, followers: null })
    return res.json({ eligible: true, followers: null, autoApproved: true })
  }

  let followers
  try {
    followers = await getFollowers(platform, handle)
  } catch (err) {
    console.error(`Platform lookup error (${platform}):`, err.message)
    return res.status(422).json({ error: 'Could not check your profile. Make sure it is public and try again.' })
  }

  if (followers === null || followers === undefined) {
    return res.status(422).json({ error: 'Could not retrieve follower count. Make sure your profile is public.' })
  }

  const eligible = followers >= THRESHOLD

  // If email is included (Step 2 claim) and they qualify, save and notify
  if (eligible && email) {
    await saveAndNotify({ handle: cleanHandle, platform, email, followers })
  }

  return res.json({ eligible, followers })
})

async function saveAndNotify({ handle, platform, email, followers }) {
  try {
    await pool.query(
      `INSERT INTO contacts (name, email, handle, platform, followers, niche, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['', email, handle, platform, followers?.toString() ?? 'auto-approved', '', 'eligibility-checker']
    )
  } catch (err) {
    console.error('Eligibility DB error:', err.message)
  }

  try {
    await sendNotification({
      subject: `Creator approved: ${handle} (${platform})`,
      text: `Handle: ${handle}\nPlatform: ${platform}\nFollowers: ${followers ?? 'auto-approved'}\nEmail: ${email}`,
    })
  } catch (err) {
    console.error('Eligibility notification error:', err.message)
  }

  try {
    await sendEmail({
      to: email,
      subject: "You're in — Breathe Collection",
      text: `Hi ${handle},

You're approved. Your Pro access code and giveaway codes are on the way within 24 hours.

---

While you wait, here's everything you need to run the giveaway the moment you have the codes.

WHAT TO POST
A giveaway post. Simple, no production needed. Show the app or just talk about it. Keep it honest — your audience can tell.

CAPTION TEMPLATE (copy-paste, edit as you like)

---
Been using this breathing app for a while now. No ads, no sleep stories, no bloat — just 9 techniques (Wim Hof, Box, Huberman and more) with haptic feedback so you can do it eyes-closed.

Giving away [X] lifetime Pro codes in the comments. Drop a 🌬️ to enter. I'll pick winners in 48h.

[link in bio]
---

WHAT TO SHOW (optional)
A screen recording of a session, or just you talking to camera. Either works.

---

Reply to this email with any questions.

Breathe Collection`,
    })
  } catch (err) {
    console.error('Approval email error:', err.message)
  }
}

module.exports = router
