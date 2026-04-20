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
  
  // Allocate 11 trial codes (1 for creator + 10 for community)
  let codes = []
  try {
    const codeRes = await pool.query(`
      UPDATE offer_codes 
      SET is_used = TRUE, used_by_email = $1, used_at = NOW() 
      WHERE id IN (
        SELECT id FROM offer_codes 
        WHERE type = 'trial' AND is_used = FALSE 
        LIMIT 11 
        FOR UPDATE SKIP LOCKED
      ) 
      RETURNING code
    `, [email])
    
    codes = codeRes.rows.map(r => r.code)
    if (codes.length === 0) {
      console.error('CRITICAL: Out of trial offer codes in the DB for', email)
    } else if (codes.length < 11) {
      console.warn(`Only ${codes.length}/11 codes allocated for ${email}`)
    }
  } catch (err) {
    console.error('Error allocating trial codes:', err.message)
  }

  const codeStr = codes[0] || null
  const friendCodesList = codes.length > 1 
    ? codes.slice(1).map(c => `- ${c}`).join('\n') 
    : "Queueing more community codes — check back soon."

  try {
    await sendNotification({
      subject: `Creator approved: ${handle} (${platform})`,
      text: `Handle: ${handle}\nPlatform: ${platform}\nFollowers: ${followers ?? 'auto-approved'}\nEmail: ${email}\nCodes Granted: ${codes.length}\nMain Code: ${codeStr ?? 'NONE'}\nWants Giveaway Codes: ${wantsGiveaways ? 'YES' : 'No'}`,
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
      subject: "You're in — here's your access",
      text: `Hi ${handle},

You're in. Here's what to do.

**STEP 1 — Activate**
Tap the link below to automatically redeem your trial in the App Store:
${appleRedeemUrl ? appleRedeemUrl : `(Your unique trial code is being generated and will be sent shortly.)`}

${codeStr ? `*If the link doesn't open, you can manually enter this code in the App Store: ${codeStr}*` : ''}

Here are 10 additional 1-month codes for you to share with your friends and community:
${friendCodesList}

**STEP 2 — Experience**
We would love for you to test the app! Breathe Collection is built for those who value zero distractions and evidence-led practice:
- **Huberman Sigh** — Fastest physiological reset for stress and anxiety.
- **Wim Hof** — High energy, perfect for morning focus and state-shifting.
- **Haptic Guidance** — Fully designed for practice with your eyes closed.

Explore the research behind our protocols here: https://www.breathecollection.app/library

**STEP 3 — Reply with your post URL**
Once you've experienced the app and shared a post with your community, simply reply to this email with the link. We'll send your **Lifetime Pro** code (no subscription, forever) within 48h.

---

**Caption starting point**
*(Make it yours — authenticity wins.)*

"I’ve been using this breathing app and it actually works for me. No ads, no fluff, just the mechanics of breath."
"This app was made for people who just want to breathe with zero distractions."
"It’s haptics-driven, so you can actually do it with your eyes closed."
"Compared to similar apps, this one is priced at about 1/10th of the market price of Calm or Headspace."

*FYI: Pro is $3.99/month or $9.99/year. Lifetime access is $39.99.*

---

We are deeply grateful to have you join us on this mission to help humans breathe better.

**Steady breath,**

Eirik
Breathe Collection`,
    })
  } catch (err) {
    console.error('Approval email error:', err.message)
  }
}

module.exports = router
