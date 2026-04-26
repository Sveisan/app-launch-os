jest.mock('../../server/db/index', () => ({
  pool: { query: jest.fn() },
}))
const { pool } = require('../../server/db/index')
const { persistDigestItems } = require('../../server/jobs/daily-value')

describe('persistDigestItems', () => {
  beforeEach(() => { pool.query.mockReset() })

  it('inserts each item idempotently and returns count of new rows', async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] })
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] })

    const items = [
      { monitored_post_id: 10, platform: 'instagram', comment_id: 'c1',
        commenter_handle: 'j', comment_text: 'how?', comment_posted_at: null,
        relevance_strategy: 'questions_v1', relevance_score: null,
        reply_draft: 'try this', reply_draft_model: 'm' },
      { monitored_post_id: 10, platform: 'instagram', comment_id: 'c2',
        commenter_handle: 'k', comment_text: 'what?', comment_posted_at: null,
        relevance_strategy: 'questions_v1', relevance_score: null,
        reply_draft: 'do that', reply_draft_model: 'm' },
    ]

    const out = await persistDigestItems(items)
    expect(out.itemsInserted).toBe(1)
    expect(out.itemsDuplicate).toBe(1)

    const sql = pool.query.mock.calls[0][0]
    expect(sql).toMatch(/INSERT INTO digest_items/i)
    expect(sql).toMatch(/ON CONFLICT \(platform, comment_id\) DO NOTHING/i)
    expect(sql).toMatch(/surfaced_in_digest_at = NOW\(\)|NOW\(\)/i)
  })
})
