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
const { discoverPosts } = require('../../server/jobs/daily-value')

describe('discoverPosts', () => {
  beforeEach(() => {
    pool.query.mockReset()
    platforms.getRecentPosts.mockReset()
  })

  it('inserts each returned post idempotently per account', async () => {
    pool.query.mockResolvedValue({ rowCount: 1 })
    platforms.getRecentPosts.mockResolvedValueOnce([
      { platform: 'instagram', post_id: 'P1', post_url: 'u1', caption: 'c',
        thumbnail_url: 't', published_at: new Date('2026-04-25') },
    ])

    const accounts = [{ handle: 'a', platform: 'instagram', source: 'pipeline', source_ref_id: 1 }]
    const summary = await discoverPosts(accounts)

    expect(summary.accountsScanned).toBe(1)
    expect(summary.postsDiscovered).toBe(1)
    expect(summary.errors).toEqual([])
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO monitored_posts/i),
      expect.arrayContaining(['instagram', 'P1', 'a', 'pipeline', 1, 'u1', 'c', 't', expect.any(Date)])
    )
    expect(pool.query.mock.calls[0][0]).toMatch(/ON CONFLICT \(platform, post_id\) DO NOTHING/i)
  })

  it('continues on per-account failure', async () => {
    platforms.getRecentPosts
      .mockRejectedValueOnce(new Error('apify down'))
      .mockResolvedValueOnce([{
        platform: 'tiktok', post_id: 'V1', post_url: 'u', caption: '', thumbnail_url: '',
        published_at: new Date()
      }])
    pool.query.mockResolvedValue({ rowCount: 1 })

    const accounts = [
      { handle: 'a', platform: 'instagram', source: 'watchlist', source_ref_id: 1 },
      { handle: 'b', platform: 'tiktok',    source: 'watchlist', source_ref_id: 2 },
    ]
    const summary = await discoverPosts(accounts)

    expect(summary.accountsScanned).toBe(2)
    expect(summary.postsDiscovered).toBe(1)
    expect(summary.errors).toHaveLength(1)
    expect(summary.errors[0]).toMatch(/a.*apify down/i)
  })

  it('aborts immediately on Apify quota error', async () => {
    platforms.getRecentPosts
      .mockRejectedValueOnce(new Error('APIFY_QUOTA_EXCEEDED: Apify 402 for x'))

    const accounts = [
      { handle: 'a', platform: 'instagram', source: 'watchlist', source_ref_id: 1 },
      { handle: 'b', platform: 'tiktok',    source: 'watchlist', source_ref_id: 2 },
      { handle: 'c', platform: 'instagram', source: 'watchlist', source_ref_id: 3 },
    ]
    const summary = await discoverPosts(accounts)

    expect(summary.quotaExhausted).toBe(true)
    expect(summary.accountsScanned).toBe(1)
    expect(platforms.getRecentPosts).toHaveBeenCalledTimes(1)
    expect(summary.errors).toHaveLength(1)
  })
})
