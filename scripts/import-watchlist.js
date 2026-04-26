const fs = require('fs')
const path = require('path')
const { pool } = require('../server/db/index')

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: node scripts/import-watchlist.js <path-to-csv>')
    console.error('CSV format per line: handle,platform[,display_name[,notes]]')
    process.exit(1)
  }
  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`)
    process.exit(1)
  }
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/)
  let added = 0, updated = 0, skipped = 0

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(',').map(s => s.trim())
    const handle = (parts[0] || '').replace(/^@/, '')
    const platform = (parts[1] || '').toLowerCase()
    const display = parts[2] || null
    const notes = parts[3] || null

    if (!handle || !['instagram', 'tiktok'].includes(platform)) {
      console.warn(`  skip: "${line}" (need handle + platform=instagram|tiktok)`)
      skipped++
      continue
    }

    const result = await pool.query(`
      INSERT INTO scout_watchlist (handle, platform, display_name, notes, is_active)
      VALUES ($1, $2, $3, $4, TRUE)
      ON CONFLICT (handle, platform) DO UPDATE
      SET display_name = COALESCE(EXCLUDED.display_name, scout_watchlist.display_name),
          notes        = COALESCE(EXCLUDED.notes,        scout_watchlist.notes),
          is_active    = TRUE
      RETURNING xmax = 0 AS inserted
    `, [handle, platform, display, notes])

    if (result.rows[0].inserted) added++
    else updated++
  }

  console.log(`\nDone. added=${added} updated=${updated} skipped=${skipped}`)
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
