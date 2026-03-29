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
      subject: "You're in — Breathe Collection Creator Program",
      text: `Hi ${handle},\n\nYou're approved for the Breathe Collection creator program.\n\nHere's what happens next:\n\n1. You'll receive your free lifetime Pro access code within 24 hours\n2. We'll send giveaway codes to share with your audience\n3. You'll get early access to new features before they ship\n\nReply to this email with any questions.\n\nBreathe Collection`,
    })
  } catch (err) {
    console.error('Approval email error:', err.message)
  }
}

module.exports = router
