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
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (handle, platform) DO UPDATE SET
         email = EXCLUDED.email,
         followers = EXCLUDED.followers,
         followers_count = EXCLUDED.followers_count,
         auto_approved = EXCLUDED.auto_approved,
         reason = contacts.reason || ' | claimed'
       `,
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
      subject: "You're in: The mechanics of breath",
      text: `Hi ${handle},

Welcome to the Breathe Collection creator program. We’re glad to have you.

Below is everything you need to activate your access and transition from generic breathwork to physiological protocols.

STEP 1 — Activate your access
${appleRedeemUrl 
  ? `Tap the link below to automatically redeem your trial in the App Store:\n${appleRedeemUrl}\n\n(If the link doesn't open, you can manually enter this code in the App Store: ${codeStr})` 
  : `Your unique trial code is being generated and will be sent in a follow-up email shortly.`}

STEP 2 — The Experience
Take a few days to test the protocols before you post. 
- The Huberman Sigh: Best for rapid stress relief.
- Wim Hof (Cyclic Hyperventilation): High-impact, highly visible for video content.
- Haptic Guidance: Put your phone away and close your eyes. The haptics are designed to keep you centered without the screen glare—this is usually the "wow" moment for audiences.

Scientific context for every technique is at breathecollection.app/creators. Use it to speak with authority.

STEP 3 — Post and Reply
Once you’ve shared your experience, reply to this email with the link. Within 24 hours, we’ll send:
1. Your Lifetime Pro code (Permanent, subscription-free access).
2. 10 viewer giveaway codes to drive engagement in your comments.

Caption starting point
(Authenticity beats templates. Make this yours.)

"I’ve been testing this breathing app and it’s genuinely different. No ads, no 'sleep stories,' no fluff. Just 9 precise protocols like Wim Hof, Box Breathing, and the Huberman sigh. It uses haptics so you can practice with your eyes closed—it feels like a legitimate tool for your nervous system.

A full Pro subscription is $29.99/year—less than half of what Calm or Headspace charge for a fraction of the utility.

I’m giving away [X] lifetime Pro codes below. Drop a 🌬️ to enter — picking winners in 48h.
[Link in bio]"

What performs best
A raw, "talk to camera" reaction or a screen recording of a live session usually outperforms a polished production. Authenticity is the point.

Any questions, just reply here.

Eirik
Breathe Collection`,
    })
  } catch (err) {
    console.error('Approval email error:', err.message)
  }
}

module.exports = router
