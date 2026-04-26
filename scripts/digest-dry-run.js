const { resolveMonitoredAccounts, discoverPosts, fetchCommentsForActivePosts } = require('../server/jobs/daily-value')
const { getStrategy } = require('../server/jobs/strategies')
const { draftReplies } = require('../server/jobs/digest-drafter')
const config = require('../config/app')
const { pool } = require('../server/db/index')

async function main() {
  console.log('Daily Value: DRY RUN (no DB writes to digest_items, no email)\n')
  try {
    const accounts = await resolveMonitoredAccounts()
    console.log(`Accounts: ${accounts.length}`)
    accounts.forEach(a => console.log(`  ${a.source}  @${a.handle}  ${a.platform}`))

    const discover = await discoverPosts(accounts)
    console.log(`\nPosts discovered: ${discover.postsDiscovered} (errors: ${discover.errors.length})`)
    discover.errors.forEach(e => console.log(`  ! ${e}`))

    const fetchOut = await fetchCommentsForActivePosts({ maxCommentsPerPost: config.digest.maxCommentsPerPost })
    console.log(`\nComments fetched: ${fetchOut.summary.commentsFetched} across ${fetchOut.summary.postsFetched} posts`)

    const strategy = getStrategy(config.digest.relevanceStrategy)
    const filtered = strategy.filter(fetchOut.comments)
    console.log(`\nFiltered (${strategy.name}): ${filtered.length} comments`)

    const drafted = await draftReplies(filtered.slice(0, 5), { model: config.digest.replyDraftModel })
    console.log(`\nDrafts (first 5):`)
    drafted.forEach(d => {
      console.log(`  @${d.commenter_handle}: "${d.comment_text}"`)
      console.log(`    -> ${d.reply_draft}`)
    })
  } catch (err) {
    console.error('Dry run failed:', err)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
