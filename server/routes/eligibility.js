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
    const appleRedeemUrl = codeStr 
      ? `https://apps.apple.com/redeem?ctx=offercodes&id=6760255541&code=${codeStr}`
      : null

    await sendEmail({
      to: email,
      subject: "You're in — Breathe Collection",
      text: `Hi ${handle},

You're approved. This is how we'll get you started.

STEP 1 — Activate 1-Month Free Access
${appleRedeemUrl 
  ? `Click the link below to automatically redeem your trial in the App Store:\n${appleRedeemUrl}\n\n(If the link doesn't open, you can manually enter this code in the App Store: ${codeStr})` 
  : `Your unique trial code is being generated and will be sent in a follow-up email shortly.`}

STEP 2 — Get Lifetime Pro
Once you have tried the app and posted your giveaway content, simply reply to this email with the link to your post. 

We will send your permanent Lifetime Pro code${wantsGiveaways ? ' + 10 viewer giveaway codes' : ''} within 24 hours of receiving your link.

---

CAPTION TEMPLATE (Optional)

"I've been using this breathing app for a while. No ads, no sleep stories, no bloat — just 9 clean techniques (Wim Hof, Box, Huberman and more) with haptic feedback so you can keep your eyes closed.

I'm giving away [X] lifetime Pro codes in the comments. Drop a 🌬️ to enter. I'll pick winners in 48h.

[Link in bio]"

---

HOW TO SHOW THE APP
A simple screen recording of a session or a quick "talk to camera" works perfectly. We want it to feel authentic to you.

Reply here when you're ready.

Eirik
Breathe Collection`,
    })
  } catch (err) {
    console.error('Approval email error:', err.message)
  }
}

module.exports = router
