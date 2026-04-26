const { runRedditProspector } = require('../server/jobs/reddit-prospector')
const { pool } = require('../server/db/index')

async function main() {
  console.log('Reddit Prospector: manual trigger...')
  try {
    const { summary } = await runRedditProspector()
    console.log('Run summary:', JSON.stringify(summary, null, 2))
  } catch (err) {
    console.error('Reddit Prospector failed:', err)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
