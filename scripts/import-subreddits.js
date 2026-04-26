const fs = require('fs')
const path = require('path')
const { pool } = require('../server/db/index')

const VALID = new Set(['anti_gamification', 'pain_point', 'biohacker'])

function parseCsv(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const out = []
  let header = null
  for (const line of lines) {
    const cells = line.split(',').map(c => c.trim())
    if (!header) {
      const lower = cells.map(c => c.toLowerCase())
      if (lower.includes('name') && lower.includes('audience')) {
        header = lower
        continue
      }
      header = ['name', 'audience', 'notes']
    }
    const obj = {}
    header.forEach((h, i) => { obj[h] = cells[i] })
    out.push(obj)
  }
  return out
}

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: node scripts/import-subreddits.js path/to/file.csv')
    console.error('CSV columns: name, audience [, notes]')
    console.error('audience must be one of: anti_gamification, pain_point, biohacker')
    process.exit(1)
  }
  const abs = path.resolve(process.cwd(), file)
  const text = fs.readFileSync(abs, 'utf8')
  const rows = parseCsv(text)
  let inserted = 0, updated = 0, skipped = 0
  for (const r of rows) {
    const name = (r.name || '').replace(/^r\//, '').trim()
    const audience = (r.audience || '').trim()
    if (!name || !VALID.has(audience)) { skipped++; continue }
    const before = await pool.query('SELECT 1 FROM reddit_subreddits WHERE name = $1', [name])
    await pool.query(`
      INSERT INTO reddit_subreddits (name, audience, notes)
      VALUES ($1, $2, $3)
      ON CONFLICT (name) DO UPDATE SET
        audience = EXCLUDED.audience,
        notes = COALESCE(EXCLUDED.notes, reddit_subreddits.notes),
        is_active = TRUE
    `, [name, audience, r.notes || null])
    if (before.rowCount === 0) inserted++; else updated++
  }
  console.log(`Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`)
  await pool.end()
}

main().catch(err => {
  console.error('Import failed:', err)
  process.exit(1)
})
