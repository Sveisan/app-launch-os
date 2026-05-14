require('dotenv').config()
const fs = require('fs')
const { pool } = require('../server/db/index')

async function run() {
  const args = process.argv.slice(2)
  const type = args[0]
  const filepath = args[1]
  let platform = 'ios'
  let campaign = null

  // Parse optional --platform and --campaign flags
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--platform' && args[i + 1]) {
      platform = args[i + 1].toLowerCase()
      i++
    } else if (args[i] === '--campaign' && args[i + 1]) {
      campaign = args[i + 1]
      i++
    } else if (args[i] && !args[i].startsWith('--')) {
      // Positional argument (old style: platform as 3rd arg)
      platform = args[i].toLowerCase()
    }
  }

  if (!type || !filepath) {
    console.log('Usage: node scripts/import-codes.js <type> <filepath> [platform] [--campaign <name>]')
    console.log('       type:     "trial", "lifetime", or "monthly"')
    console.log('       filepath: path to a .txt or .csv file with one code per line')
    console.log('       platform: "ios" (default) or "android"')
    console.log('       --campaign <name>: optional campaign tag (e.g., "free-event-2026")')
    process.exit(1)
  }

  if (!['trial', 'lifetime', 'monthly'].includes(type)) {
    console.error('Error: type must be "trial", "lifetime", or "monthly"')
    process.exit(1)
  }

  if (!['ios', 'android'].includes(platform)) {
    console.error('Error: platform must be "ios" or "android"')
    process.exit(1)
  }

  let codes = []
  try {
    const raw = fs.readFileSync(filepath, 'utf8')
    codes = raw.split(/\r?\n/)
      .map(line => line.trim())
      // Skip blanks, CSV header rows, and anything that doesn't look like a promo code
      .filter(line => /^[A-Za-z0-9]{8,}$/.test(line))
  } catch (err) {
    console.error(`Error reading file: ${err.message}`)
    process.exit(1)
  }

  if (codes.length === 0) {
    console.log('No valid codes found in the file.')
    process.exit(0)
  }

  console.log(`Found ${codes.length} codes. Inserting as "${type}" / platform "${platform}"${campaign ? ` / campaign "${campaign}"` : ''}...`)

  let successCount = 0

  const client = await pool.connect()
  try {
    for (const code of codes) {
      try {
        if (campaign) {
          await client.query(
            `INSERT INTO offer_codes (code, type, platform, campaign) VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING`,
            [code, type, platform, campaign]
          )
        } else {
          await client.query(
            `INSERT INTO offer_codes (code, type, platform) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`,
            [code, type, platform]
          )
        }
        successCount++
      } catch (err) {
        console.error(`Failed to insert ${code}:`, err.message)
      }
    }
  } finally {
    client.release()
  }

  console.log('---')
  console.log(`Finished processing ${codes.length} codes.`)
  console.log(`(Note: Duplicate codes are safely ignored)`)

  await pool.end()
}

run()
