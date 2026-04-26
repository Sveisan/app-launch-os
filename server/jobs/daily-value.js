const { pool } = require('../db/index')
const platforms = require('../platforms')

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

async function discoverPosts(accounts, { sinceHours = 24 } = {}) {
  const summary = { accountsScanned: 0, postsDiscovered: 0, errors: [] }
  for (const acct of accounts) {
    summary.accountsScanned++
    try {
      const posts = await platforms.getRecentPosts(acct.platform, acct.handle, { sinceHours })
      for (const p of posts) {
        const result = await pool.query(`
          INSERT INTO monitored_posts (
            platform, post_id, account_handle, source, source_ref_id,
            post_url, caption, thumbnail_url, published_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (platform, post_id) DO NOTHING
        `, [p.platform, p.post_id, acct.handle, acct.source, acct.source_ref_id,
            p.post_url, p.caption, p.thumbnail_url, p.published_at])
        if (result.rowCount > 0) summary.postsDiscovered++
      }
    } catch (err) {
      summary.errors.push(`@${acct.handle} (${acct.platform}): ${err.message}`)
    }
  }
  return summary
}

async function fetchCommentsForActivePosts({ maxCommentsPerPost }) {
  const summary = { postsFetched: 0, commentsFetched: 0, errors: [] }
  const all = []

  const postsRes = await pool.query(`
    SELECT id, platform, post_id, post_url
    FROM monitored_posts
    WHERE archived_at IS NULL
      AND published_at > NOW() - INTERVAL '7 days'
    ORDER BY last_comments_fetched_at NULLS FIRST
  `)

  for (const post of postsRes.rows) {
    try {
      const comments = await platforms.getPostComments(post.platform, post.post_id, {
        postUrl: post.post_url,
        limit: maxCommentsPerPost,
      })
      summary.postsFetched++
      summary.commentsFetched += comments.length
      for (const c of comments) {
        all.push({ ...c, monitored_post_id: post.id })
      }
      await pool.query(
        `UPDATE monitored_posts SET last_comments_fetched_at = NOW() WHERE id = $1`,
        [post.id]
      )
    } catch (err) {
      summary.errors.push(`post ${post.platform}:${post.post_id}: ${err.message}`)
    }
  }

  return { comments: all, summary }
}

async function persistDigestItems(items) {
  const summary = { itemsInserted: 0, itemsDuplicate: 0 }
  for (const it of items) {
    const result = await pool.query(`
      INSERT INTO digest_items (
        monitored_post_id, platform, comment_id, commenter_handle, comment_text,
        comment_posted_at, relevance_strategy, relevance_score,
        reply_draft, reply_draft_model, status, surfaced_in_digest_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'new', NOW())
      ON CONFLICT (platform, comment_id) DO NOTHING
      RETURNING id
    `, [
      it.monitored_post_id, it.platform, it.comment_id, it.commenter_handle, it.comment_text,
      it.comment_posted_at, it.relevance_strategy, it.relevance_score,
      it.reply_draft, it.reply_draft_model,
    ])
    if (result.rowCount > 0) summary.itemsInserted++
    else summary.itemsDuplicate++
  }
  return summary
}

module.exports = { resolveMonitoredAccounts, discoverPosts, fetchCommentsForActivePosts, persistDigestItems }
