const { pool } = require('../db/index')

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

module.exports = { resolveMonitoredAccounts }
