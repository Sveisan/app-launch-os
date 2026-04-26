const { pool } = require('../db/index')
const platforms = require('../platforms')

async function resolveMonitoredAccounts() {
  const pipelineRes = await pool.query(`
    SELECT handle, LOWER(platform) AS platform, 'pipeline' AS source, id AS source_ref_id
    FROM contacts
    WHERE pipeline_status IN ('discovery','researching','approved')
      AND LOWER(platform) IN ('instagram','tiktok')
      AND handle IS NOT NULL
  `)
  const watchRes = await pool.query(`
    SELECT handle, platform, 'watchlist' AS source, id AS source_ref_id
    FROM scout_watchlist
    WHERE is_active = TRUE
      AND platform IN ('instagram','tiktok')
  `)

  const map = new Map()
  for (const r of pipelineRes.rows) {
    map.set(`${r.platform}:${r.handle.toLowerCase()}`, r)
  }
  for (const r of watchRes.rows) {
    const key = `${r.platform}:${r.handle.toLowerCase()}`
    if (!map.has(key)) map.set(key, r)
  }
  return [...map.values()]
}

async function discoverPosts(accounts, { sinceHours = 24 } = {}) {
  const summary = { accountsScanned: 0, postsDiscovered: 0, errors: [] }
  for (const acct of accounts) {
    summary.accountsScanned++
    try {
      const posts = await platforms.getRecentPosts(acct.platform, acct.handle, { sinceHours })
      for (const p of posts) {
        const result = await pool.query(`
          INSERT INTO monitored_posts (
            platform, post_id, account_handle, source, source_ref_id,
            post_url, caption, thumbnail_url, published_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (platform, post_id) DO NOTHING
        `, [p.platform, p.post_id, acct.handle, acct.source, acct.source_ref_id,
            p.post_url, p.caption, p.thumbnail_url, p.published_at])
        if (result.rowCount > 0) summary.postsDiscovered++
      }
    } catch (err) {
      summary.errors.push(`@${acct.handle} (${acct.platform}): ${err.message}`)
    }
  }
  return summary
}

module.exports = { resolveMonitoredAccounts, discoverPosts }
