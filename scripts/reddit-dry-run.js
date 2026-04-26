const { runRedditProspector } = require('../server/jobs/reddit-prospector')
const { pool } = require('../server/db/index')

async function main() {
  console.log('Reddit Prospector: DRY RUN (no DB writes, no scout_logs)\n')
  try {
    const { summary, drafted } = await runRedditProspector({ dryRun: true })
    console.log('Summary:', JSON.stringify(summary, null, 2))
    console.log(`\nDrafts (${drafted.length}):`)
    for (const d of drafted) {
      console.log(`\n[${d.kind}] r/${d.subreddit} @${d.author_handle} (audience=${d.audience}${d.draft_contains_pitch ? ', PITCH' : ''})`)
      if (d.title) console.log(`  title: ${d.title}`)
      console.log(`  body : ${(d.body || '').slice(0, 200)}`)
      console.log(`  url  : ${d.thread_url}`)
      console.log(`  draft: ${d.draft_reply}`)
    }
  } catch (err) {
    console.error('Dry run failed:', err)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
