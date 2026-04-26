process.env.ADMIN_SECRET_KEY = 'test'
jest.mock('../../server/db/index', () => ({
  pool: { query: jest.fn() },
}))
jest.mock('../../server/platforms', () => ({
  getRecentPosts: jest.fn().mockResolvedValue([]),
  getPostComments: jest.fn().mockResolvedValue([]),
}))
jest.mock('../../server/jobs/digest-drafter', () => ({
  draftReplies: jest.fn(async (items) => items.map(c => ({ ...c, reply_draft: 'd', reply_draft_model: 'm' }))),
}))
jest.mock('../../server/email/index', () => ({
  sendNotification: jest.fn().mockResolvedValue(),
  sendEmail: jest.fn().mockResolvedValue(),
}))

const { pool } = require('../../server/db/index')
const platforms = require('../../server/platforms')
const email = require('../../server/email/index')
const { runDailyValue } = require('../../server/jobs/daily-value')

beforeEach(() => {
  pool.query.mockReset()
  platforms.getRecentPosts.mockClear()
  platforms.getPostComments.mockClear()
  email.sendEmail.mockClear()
  email.sendNotification.mockClear()
})

describe('runDailyValue', () => {
  it('skips email when no items surfaced', async () => {
    pool.query.mockImplementation((sql) => {
      if (/FROM contacts/i.test(sql)) return { rows: [] }
      if (/FROM scout_watchlist/i.test(sql)) return { rows: [] }
      if (/FROM monitored_posts/i.test(sql)) return { rows: [] }
      if (/INSERT INTO scout_logs/i.test(sql)) return { rows: [] }
      return { rows: [], rowCount: 0 }
    })
    const summary = await runDailyValue()
    expect(email.sendNotification).not.toHaveBeenCalled()
    expect(email.sendEmail).not.toHaveBeenCalled()
    expect(summary.itemsSurfaced).toBe(0)
  })

  it('sends email when items surface and writes a scout_logs row', async () => {
    const monitoredId = 99
    pool.query.mockImplementation((sql, params) => {
      if (/FROM contacts/i.test(sql)) {
        return { rows: [{ handle: 'a', platform: 'instagram', source: 'pipeline', source_ref_id: 1 }] }
      }
      if (/FROM scout_watchlist/i.test(sql)) return { rows: [] }
      if (/INSERT INTO monitored_posts/i.test(sql)) return { rowCount: 1 }
      if (/SELECT id, caption FROM monitored_posts/i.test(sql)) {
        return { rows: [{ id: monitoredId, caption: '' }] }
      }
      if (/FROM monitored_posts/i.test(sql) && /archived_at IS NULL/i.test(sql)) {
        return { rows: [{ id: monitoredId, platform: 'instagram', post_id: 'P1', post_url: 'u' }] }
      }
      if (/UPDATE monitored_posts/i.test(sql)) return { rowCount: 1 }
      if (/INSERT INTO digest_items/i.test(sql)) return { rowCount: 1, rows: [{ id: 1 }] }
      if (/FROM digest_items d/i.test(sql)) {
        return { rows: [{
          id: 1, monitored_post_id: monitoredId, platform: 'instagram',
          commenter_handle: 'jane', comment_text: 'how?', comment_posted_at: new Date(),
          reply_draft: 'd', account_handle: 'a', caption: '', thumbnail_url: '', post_url: 'u',
        }]}
      }
      if (/INSERT INTO scout_logs/i.test(sql)) return { rows: [] }
      return { rows: [], rowCount: 0 }
    })

    platforms.getRecentPosts.mockResolvedValueOnce([{
      platform: 'instagram', post_id: 'P1', post_url: 'u', caption: '', thumbnail_url: '',
      published_at: new Date(),
    }])
    platforms.getPostComments.mockResolvedValueOnce([{
      platform: 'instagram', post_id: 'P1', comment_id: 'C1',
      commenter_handle: 'jane', comment_text: 'how?', comment_posted_at: new Date(),
    }])

    const summary = await runDailyValue()
    expect(email.sendNotification).toHaveBeenCalledTimes(1)
    expect(summary.itemsSurfaced).toBeGreaterThan(0)

    const logCall = pool.query.mock.calls.find(c => /INSERT INTO scout_logs/i.test(c[0]))
    expect(logCall).toBeTruthy()
    expect(logCall[1][0]).toMatch(/Daily Value/i)
  })
})
