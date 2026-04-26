const { runDailyValue } = require('../server/jobs/daily-value')
const { pool } = require('../server/db/index')

async function main() {
  console.log('Daily Value: manual trigger...')
  try {
    const summary = await runDailyValue()
    console.log('Run summary:', JSON.stringify(summary, null, 2))
  } catch (err) {
    console.error('Daily Value failed:', err)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
