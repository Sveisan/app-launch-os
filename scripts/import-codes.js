require('dotenv').config()
const fs = require('fs')
const { pool } = require('../server/db/index')

async function run() {
  const [,, type, filepath] = process.argv

  if (!type || !filepath) {
    console.log('Usage: node scripts/import-codes.js <type> <filepath>')
    console.log('       type: "trial" or "lifetime"')
    console.log('       filepath: path to a .txt file containing one code per line')
    process.exit(1)
  }

  if (!['trial', 'lifetime'].includes(type)) {
    console.error('Error: type must be "trial" or "lifetime"')
    process.exit(1)
  }

  let codes = []
  try {
    const raw = fs.readFileSync(filepath, 'utf8')
    codes = raw.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 5) // ensure it's actually a code
  } catch (err) {
    console.error(`Error reading file: ${err.message}`)
    process.exit(1)
  }

  if (codes.length === 0) {
    console.log('No valid codes found in the file.')
    process.exit(0)
  }

  console.log(`Found ${codes.length} codes. Inserting as "${type}"...`)

  let successCount = 0
  let skipCount = 0

  const client = await pool.connect()
  try {
    for (const code of codes) {
      try {
        await client.query(
          `INSERT INTO offer_codes (code, type) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING`,
          [code, type]
        )
        // ON CONFLICT DO NOTHING doesn't throw if it exists, it just returns rowCount 0
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
