process.env.ADMIN_SECRET_KEY = 'test-secret'

jest.mock('../../config/app', () => ({
  appName: 'Breathe Collection',
  supportEmail: 't@t.com',
  fromEmail: 'from@t.com',
  resend: { apiKey: 'k' },
  apify: { apiToken: 't' },
  eligibility: { followerThreshold: 500 },
  db: {},
  digest: {
    recipient: 'r@t.com', cron: '0 6 * * *', relevanceStrategy: 'questions_v1',
    maxCommentsPerPost: 100, replyDraftModel: 'claude-haiku-4-5-20251001',
    digestUrlBase: 'https://example.com',
  },
}))

const { renderDigestEmail } = require('../../server/email/daily-value')

const item = (overrides = {}) => ({
  id: 1, monitored_post_id: 10, platform: 'instagram',
  commenter_handle: 'jane', comment_text: 'how?', comment_posted_at: new Date(),
  reply_draft: 'try this', post: { account_handle: 'creator',
    caption: 'a post', thumbnail_url: 'https://t/1.jpg', post_url: 'https://i/p/1' },
  ...overrides,
})

describe('renderDigestEmail', () => {
  it('returns null for empty items', () => {
    expect(renderDigestEmail({ items: [], runSummary: {} })).toBeNull()
  })

  it('renders subject with N count and date', () => {
    const out = renderDigestEmail({ items: [item()], runSummary: {} })
    expect(out.subject).toMatch(/Daily Value — 1 comment/)
  })

  it('renders multiple comments grouped by post', () => {
    const items = [
      item({ id: 1, comment_text: 'q1' }),
      item({ id: 2, comment_text: 'q2' }),
      item({ id: 3, monitored_post_id: 11, post: { account_handle: 'other',
        caption: 'b', thumbnail_url: '', post_url: 'https://i/p/2' }, comment_text: 'q3' }),
    ]
    const out = renderDigestEmail({ items, runSummary: { } })
    expect(out.html).toContain('@creator')
    expect(out.html).toContain('@other')
    expect(out.html).toContain('q1')
    expect(out.html).toContain('q2')
    expect(out.html).toContain('q3')
    expect(out.subject).toMatch(/3 comments/)
  })

  it('includes a Mark replied link with a verifiable token', () => {
    const { verify } = require('../../server/jobs/digest-token')
    const out = renderDigestEmail({ items: [item({ id: 42 })], runSummary: {} })
    const linkMatch = out.html.match(/href="https:\/\/example\.com\/mission-control-x89\/daily-value\/items\/42\/status\?to=replied&amp;token=([^"]+)"/)
    expect(linkMatch).toBeTruthy()
    const decoded = verify(linkMatch[1])
    expect(decoded).toEqual({ id: 42, status: 'replied' })
  })

  it('plain text contains all comments and links', () => {
    const out = renderDigestEmail({ items: [item({ comment_text: 'hello?' })], runSummary: {} })
    expect(out.text).toContain('@creator')
    expect(out.text).toContain('hello?')
    expect(out.text).toContain('https://i/p/1')
  })
})
