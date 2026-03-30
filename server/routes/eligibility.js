const express = require('express')
const router = express.Router()
const { pool } = require('../db/index')
const { sendNotification, sendEmail } = require('../email/index')
const { getFollowers } = require('../platforms/index')
const config = require('../../config/app')

const THRESHOLD = config.eligibility.followerThreshold

function isValidEmail(str) {
  return str && str.includes('@') && str.indexOf('@') !== 0 && str.lastIndexOf('.') > str.indexOf('@')
}

// Step 1: Check eligibility — no email required
// Step 2: Claim (email provided) — saves to DB and sends emails
router.post('/', async (req, res) => {
  const { handle, platform, email, wantsGiveaways } = req.body
  if (!handle || !platform) {
    return res.status(400).json({ error: 'handle and platform are required' })
  }

  const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`

  // OnlyFans: auto-approve
  if (platform === 'onlyfans') {
    if (email) {
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'A valid email address is required.' })
      }
      try {
        await saveAndNotify({ handle: cleanHandle, platform, email, followers: null, wantsGiveaways })
      } catch (err) {
        console.error('saveAndNotify error:', err.message)
      }
    }
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
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' })
    }
    try {
      await saveAndNotify({ handle: cleanHandle, platform, email, followers, wantsGiveaways })
    } catch (err) {
      console.error('saveAndNotify error:', err.message)
    }
  }

  return res.json({ eligible, followers })
})

async function saveAndNotify({ handle, platform, email, followers, wantsGiveaways }) {
  try {
    const isAutoApproved = followers === null
    await pool.query(
      `INSERT INTO contacts (name, email, handle, platform, followers, followers_count, auto_approved, niche, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      ['', email, handle, platform,
       isAutoApproved ? 'auto-approved' : String(followers),  // legacy TEXT column
       isAutoApproved ? null : followers,                      // typed INTEGER column
       isAutoApproved,                                         // typed BOOLEAN column
       '', 'eligibility-checker']
    )
  } catch (err) {
    console.error('Eligibility DB error:', err.message)
    // Do not send emails if the DB write failed — creator would have a code but no record.
    return
  }

  // DB write succeeded — safe to send emails now
  
  // Try to pop a trial code from the pool
  let codeStr = null
  try {
    const codeRes = await pool.query(`
      UPDATE offer_codes 
      SET is_used = TRUE, used_by_email = $1, used_at = NOW() 
      WHERE id = (
        SELECT id FROM offer_codes WHERE type = 'trial' AND is_used = FALSE LIMIT 1 FOR UPDATE SKIP LOCKED
      ) 
      RETURNING code
    `, [email])
    
    if (codeRes.rows.length > 0) {
      codeStr = codeRes.rows[0].code
    } else {
      console.error('CRITICAL: Out of trial offer codes in the DB for', email)
    }
  } catch (err) {
    console.error('Error allocating trial code:', err.message)
  }

  try {
    await sendNotification({
      subject: `Creator approved: ${handle} (${platform})`,
      text: `Handle: ${handle}\nPlatform: ${platform}\nFollowers: ${followers ?? 'auto-approved'}\nEmail: ${email}\nCode Granted: ${codeStr ?? 'NONE - POOL EMPTY'}\nWants Giveaway Codes: ${wantsGiveaways ? 'YES' : 'No'}`,
    })
  } catch (err) {
    console.error('Eligibility notification error:', err.message)
  }

  try {
    await sendEmail({
      to: email,
      subject: "You're in — Breathe Collection",
      text: `Hi ${handle},

You're approved. Here's how it works.

STEP 1 — Try it (1 month free)
${codeStr ? `Your trial code is below. Download Breathe Collection on the App Store and redeem it.\nCode: ${codeStr}` : `Your trial code is being generated and is on the way. Download Breathe Collection on the App Store to get ready.`}

STEP 2 — Post and get lifetime
Once you've posted your giveaway, reply to this email with the link. We'll send your lifetime Pro code${wantsGiveaways ? ' + 10 giveaway codes (2-month access) for your audience' : ''} the same day.

---

CAPTION TEMPLATE (for when you're ready)

Been using this breathing app for a while now. No ads, no sleep stories, no bloat — just 9 techniques (Wim Hof, Box, Huberman and more) with haptic feedback so you can do it eyes-closed.

Giving away [X] lifetime Pro codes in the comments. Drop a 🌬️ to enter. I'll pick winners in 48h.

[link in bio]

---

WHAT TO SHOW
A screen recording of a session, or just you talking to camera. Either works.

---

Reply to this email with your post link when you're ready.

Breathe Collection`,
    })
  } catch (err) {
    console.error('Approval email error:', err.message)
  }
}

module.exports = router
