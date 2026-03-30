require('dotenv').config()
const { pool } = require('../server/db/index')

async function run() {
  const [, , creatorEmail, giveawayCountStr] = process.argv

  if (!creatorEmail) {
    console.log('Usage: node scripts/approve-post.js <creator_email> [giveaway_count]')
    console.log('       e.g., node scripts/approve-post.js breathninja@gmail.com 5')
    process.exit(1)
  }

  const giveawayCount = parseInt(giveawayCountStr || '5', 10)

  console.log(`\n🔍 Finding 1 Lifetime Code + ${giveawayCount} Giveaway (Trial) Codes...`)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. Get Lifetime Code
    const lifeRes = await client.query(`
      UPDATE offer_codes 
      SET is_used = TRUE, used_by_email = $1, used_at = NOW() 
      WHERE id = (SELECT id FROM offer_codes WHERE type = 'lifetime' AND is_used = FALSE LIMIT 1 FOR UPDATE SKIP LOCKED) 
      RETURNING code
    `, [`${creatorEmail} (LIFETIME)`])

    if (lifeRes.rows.length === 0) {
      throw new Error("OUT OF LIFETIME CODES! Please upload more.")
    }
    const lifetimeCode = lifeRes.rows[0].code

    // 2. Get Giveaway Codes (usually 1-month trials)
    const giveawayCodes = []
    if (giveawayCount > 0) {
      const gRes = await client.query(`
        UPDATE offer_codes 
        SET is_used = TRUE, used_by_email = $1, used_at = NOW() 
        WHERE id IN (
          SELECT id FROM offer_codes WHERE type = 'trial' AND is_used = FALSE LIMIT $2 FOR UPDATE SKIP LOCKED
        ) 
        RETURNING code
      `, [`${creatorEmail} (GIVEAWAY)`, giveawayCount])

      if (gRes.rows.length < giveawayCount) {
        throw new Error(`Only found ${gRes.rows.length} trial codes left for the giveaway. Please upload more.`)
      }
      giveawayCodes.push(...gRes.rows.map(r => r.code))
    }

    await client.query('COMMIT')

    console.log('\n✅ Success! Here is your copy-paste email templates:\n')
    console.log('--------------------------------------------------')
    console.log(`SUBJECT: Your Lifetime Pro Code + Giveaway Winners`)
    console.log('--------------------------------------------------')
    console.log(`Amazing video — thanks for posting!`)
    console.log(``)
    console.log(`Here is your personal Lifetime Pro code:`)
    console.log(`${lifetimeCode}`)
    console.log(``)
    console.log(`And here are the ${giveawayCount} 1-month codes to hand out to the winners in your comments:`)
    giveawayCodes.forEach((c, i) => console.log(`${i+1}. ${c}`))
    console.log(``)
    console.log(`Breathe Collection`)
    console.log('--------------------------------------------------\n')

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('\n❌ ERROR:', err.message)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
