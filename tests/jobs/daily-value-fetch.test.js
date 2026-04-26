jest.mock('../../server/db/index', () => ({
  pool: { query: jest.fn() },
}))
jest.mock('../../server/platforms', () => ({
  getRecentPosts: jest.fn(),
  getPostComments: jest.fn(),
  QUOTA_TAG: 'APIFY_QUOTA_EXCEEDED',
}))

const { pool } = require('../../server/db/index')
const platforms = require('../../server/platforms')
const { fetchCommentsForActivePosts } = require('../../server/jobs/daily-value')

describe('fetchCommentsForActivePosts', () => {
  beforeEach(() => {
    pool.query.mockReset()
    platforms.getPostComments.mockReset()
  })

  it('queries posts inside 7-day window only', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] })
    await fetchCommentsForActivePosts({ maxCommentsPerPost: 100 })
    const sql = pool.query.mock.calls[0][0]
    expect(sql).toMatch(/archived_at IS NULL/i)
    expect(sql).toMatch(/published_at\s*>\s*NOW\(\)\s*-\s*INTERVAL\s*'7 days'/i)
    expect(sql).toMatch(/ORDER BY last_comments_fetched_at NULLS FIRST/i)
  })

  it('returns flattened comments and updates fetched_at', async () => {
    pool.query.mockResolvedValueOnce({ rows: [
      { id: 10, platform: 'instagram', post_id: 'P1', post_url: 'u1' },
      { id: 11, platform: 'tiktok',    post_id: 'V1', post_url: 'u2' },
    ]})
    platforms.getPostComments
      .mockResolvedValueOnce([
        { platform: 'instagram', post_id: 'P1', comment_id: 'c1',
          commenter_handle: 'j', comment_text: 'hi', comment_posted_at: null },
      ])
      .mockResolvedValueOnce([
        { platform: 'tiktok', post_id: 'V1', comment_id: 'c2',
          commenter_handle: 'k', comment_text: 'how?', comment_posted_at: null },
      ])
    pool.query.mockResolvedValue({ rowCount: 1 })

    const out = await fetchCommentsForActivePosts({ maxCommentsPerPost: 100 })
    expect(out.comments).toHaveLength(2)
    expect(out.comments[0]).toMatchObject({ comment_id: 'c1', monitored_post_id: 10 })
    expect(out.comments[1]).toMatchObject({ comment_id: 'c2', monitored_post_id: 11 })
    expect(out.summary.postsFetched).toBe(2)
    expect(out.summary.commentsFetched).toBe(2)
    expect(out.summary.errors).toEqual([])

    const updateCalls = pool.query.mock.calls.filter(
      c => /UPDATE monitored_posts SET last_comments_fetched_at/i.test(c[0])
    )
    expect(updateCalls).toHaveLength(2)
  })

  it('isolates per-post failure', async () => {
    pool.query.mockResolvedValueOnce({ rows: [
      { id: 10, platform: 'instagram', post_id: 'P1', post_url: 'u1' },
      { id: 11, platform: 'instagram', post_id: 'P2', post_url: 'u2' },
    ]})
    platforms.getPostComments
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce([{
        platform: 'instagram', post_id: 'P2', comment_id: 'c',
        commenter_handle: 'j', comment_text: 'hi', comment_posted_at: null
      }])
    pool.query.mockResolvedValue({ rowCount: 1 })

    const out = await fetchCommentsForActivePosts({ maxCommentsPerPost: 100 })
    expect(out.summary.errors).toHaveLength(1)
    expect(out.summary.commentsFetched).toBe(1)
  })

  it('aborts immediately on Apify quota error', async () => {
    pool.query.mockResolvedValueOnce({ rows: [
      { id: 10, platform: 'instagram', post_id: 'P1', post_url: 'u1' },
      { id: 11, platform: 'instagram', post_id: 'P2', post_url: 'u2' },
      { id: 12, platform: 'tiktok',    post_id: 'V3', post_url: 'u3' },
    ]})
    platforms.getPostComments
      .mockRejectedValueOnce(new Error('APIFY_QUOTA_EXCEEDED: 402'))

    const out = await fetchCommentsForActivePosts({ maxCommentsPerPost: 100 })
    expect(out.summary.quotaExhausted).toBe(true)
    expect(platforms.getPostComments).toHaveBeenCalledTimes(1)
    expect(out.summary.errors).toHaveLength(1)
  })
})
