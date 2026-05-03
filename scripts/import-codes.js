require('dotenv').config()
const fs = require('fs')
const { pool } = require('../server/db/index')

async function run() {
  const [,, type, filepath, platformArg] = process.argv
  const platform = (platformArg || 'ios').toLowerCase()

  if (!type || !filepath) {
    console.log('Usage: node scripts/import-codes.js <type> <filepath> [platform]')
    console.log('       type:     "trial" or "lifetime"')
    console.log('       filepath: path to a .txt or .csv file with one code per line')
    console.log('       platform: "ios" (default) or "android"')
    process.exit(1)
  }

  if (!['trial', 'lifetime'].includes(type)) {
    console.error('Error: type must be "trial" or "lifetime"')
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

  console.log(`Found ${codes.length} codes. Inserting as "${type}" / platform "${platform}"...`)

  let successCount = 0

  const client = await pool.connect()
  try {
    for (const code of codes) {
      try {
        await client.query(
          `INSERT INTO offer_codes (code, type, platform) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`,
          [code, type, platform]
        )
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
