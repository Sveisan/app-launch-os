const realFetch = global.fetch

beforeEach(() => {
  global.fetch = jest.fn()
})
afterAll(() => {
  global.fetch = realFetch
})

jest.mock('../../config/app', () => ({
  apify: { apiToken: 'TEST_TOKEN' },
  appName: 'Test', supportEmail: 't@t.com', fromEmail: 't@t.com',
  resend: { apiKey: 'k' }, eligibility: { followerThreshold: 500 },
  db: {},
}))

const platforms = require('../../server/platforms')

describe('getRecentPosts', () => {
  it('Instagram: maps actor response to normalized posts', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-25T12:00:00Z'))
    try {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => [{
          latestPosts: [
            { id: 'POST1', shortCode: 'aaa', caption: 'hi',
              displayUrl: 'https://i/img.jpg', timestamp: '2026-04-25T10:00:00Z' }
          ]
        }],
      })

      const posts = await platforms.getRecentPosts('instagram', 'creator', { sinceHours: 24 })
      expect(posts).toHaveLength(1)
      expect(posts[0]).toMatchObject({
        platform: 'instagram',
        post_id: 'POST1',
        post_url: 'https://www.instagram.com/p/aaa/',
        caption: 'hi',
        thumbnail_url: 'https://i/img.jpg',
      })
      expect(posts[0].published_at).toBeInstanceOf(Date)
    } finally {
      jest.useRealTimers()
    }
  })

  it('Instagram: filters out posts older than sinceHours', async () => {
    const old = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
    const fresh = new Date(Date.now() - 1 * 3600 * 1000).toISOString()
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [{
        latestPosts: [
          { id: 'OLD', shortCode: 'old', caption: '', displayUrl: '', timestamp: old },
          { id: 'NEW', shortCode: 'new', caption: '', displayUrl: '', timestamp: fresh },
        ]
      }],
    })

    const posts = await platforms.getRecentPosts('instagram', 'creator', { sinceHours: 24 })
    expect(posts.map(p => p.post_id)).toEqual(['NEW'])
  })

  it('TikTok: maps actor response', async () => {
    const fresh = new Date(Date.now() - 1 * 3600 * 1000).toISOString()
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [{
        id: 'V1',
        webVideoUrl: 'https://www.tiktok.com/@u/video/V1',
        text: 'caption',
        videoMeta: { coverUrl: 'https://t/c.jpg' },
        createTimeISO: fresh,
      }],
    })

    const posts = await platforms.getRecentPosts('tiktok', 'u', { sinceHours: 24 })
    expect(posts).toHaveLength(1)
    expect(posts[0].post_id).toBe('V1')
    expect(posts[0].post_url).toBe('https://www.tiktok.com/@u/video/V1')
  })

  it('throws on unsupported platform', async () => {
    await expect(platforms.getRecentPosts('youtube', 'u'))
      .rejects.toThrow(/Unsupported platform/)
  })

  it('Instagram: throws when latestPosts is missing (actor schema regression)', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [{ /* no latestPosts field */ followersCount: 5000 }],
    })
    await expect(platforms.getRecentPosts('instagram', 'creator', { sinceHours: 24 }))
      .rejects.toThrow(/actor response may have changed/i)
  })

  it('TikTok: throws when response is not an array', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    })
    await expect(platforms.getRecentPosts('tiktok', 'u', { sinceHours: 24 }))
      .rejects.toThrow(/actor response may have changed/i)
  })
})

describe('getPostComments', () => {
  it('Instagram: maps comment-scraper response', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'C1', ownerUsername: 'jane', text: 'how does this work?',
          timestamp: '2026-04-25T11:00:00Z' },
      ],
    })
    const comments = await platforms.getPostComments('instagram', 'POST1', {
      postUrl: 'https://www.instagram.com/p/aaa/',
    })
    expect(comments).toEqual([{
      platform: 'instagram',
      post_id: 'POST1',
      comment_id: 'C1',
      commenter_handle: 'jane',
      comment_text: 'how does this work?',
      comment_posted_at: expect.any(Date),
    }])
  })

  it('TikTok: maps comment-scraper response', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { cid: 'C1', uniqueId: 'jane', text: 'what does this mean?',
          createTimeISO: '2026-04-25T11:00:00Z' },
      ],
    })
    const comments = await platforms.getPostComments('tiktok', 'V1', {
      postUrl: 'https://www.tiktok.com/@u/video/V1',
    })
    expect(comments[0].comment_id).toBe('C1')
    expect(comments[0].commenter_handle).toBe('jane')
  })

  it('throws if Apify returns non-OK', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 503 })
    await expect(platforms.getPostComments('instagram', 'X', { postUrl: 'u' }))
      .rejects.toThrow(/Apify responded 503/)
  })

  it('Instagram: throws when response is not an array', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    })
    await expect(platforms.getPostComments('instagram', 'P1', { postUrl: 'u' }))
      .rejects.toThrow(/actor response may have changed/i)
  })

  it('TikTok: throws when response is not an array', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    })
    await expect(platforms.getPostComments('tiktok', 'V1', { postUrl: 'u' }))
      .rejects.toThrow(/actor response may have changed/i)
  })
})
