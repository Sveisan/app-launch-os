process.env.REDDIT_STALE_CACHE_RETRY_MS = '5'
process.env.REDDIT_REQUEST_TIMEOUT_MS = '5000'
const fetcher = require('../../server/jobs/reddit-fetcher')

const NOW = Math.floor(Date.now() / 1000)

function listing(items) {
  return { data: { children: items.map(i => ({ data: i })) } }
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => { global.fetch = jest.fn() })
afterEach(() => { delete global.fetch })

describe('fetchPosts', () => {
  it('returns children on success and sends User-Agent', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse(listing([
      { id: 'p1', created_utc: NOW - 60 },
    ])))
    const out = await fetcher.fetchPosts('Anxiety')
    expect(out).toHaveLength(1)
    expect(out[0].data.id).toBe('p1')
    const callArgs = global.fetch.mock.calls[0]
    expect(callArgs[0]).toMatch('https://www.reddit.com/r/Anxiety/new.json')
    expect(callArgs[1].headers['User-Agent']).toMatch(/breathe-collection/)
  })

  it('throws RedditRateLimitError on 429', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({}, 429))
    await expect(fetcher.fetchPosts('x', { allowRetry: false })).rejects.toMatchObject({ code: 'REDDIT_RATE_LIMIT' })
  })

  it('throws REDDIT_STALE_CACHE if both fetches return stale items', async () => {
    const stale = listing([{ id: 'p1', created_utc: NOW - 30 * 24 * 3600 }])
    global.fetch
      .mockResolvedValueOnce(jsonResponse(stale))
      .mockResolvedValueOnce(jsonResponse(stale))
    await expect(fetcher.fetchPosts('x')).rejects.toMatchObject({ code: 'REDDIT_STALE_CACHE' })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  }, 60000)

  it('returns retry result if second fetch is fresh', async () => {
    const stale = listing([{ id: 'p1', created_utc: NOW - 30 * 24 * 3600 }])
    const fresh = listing([{ id: 'p2', created_utc: NOW - 60 }])
    global.fetch
      .mockResolvedValueOnce(jsonResponse(stale))
      .mockResolvedValueOnce(jsonResponse(fresh))
    const out = await fetcher.fetchPosts('x')
    expect(out[0].data.id).toBe('p2')
  }, 60000)
})

describe('isStale', () => {
  it('treats empty as stale', () => {
    expect(fetcher.isStale([])).toBe(true)
  })
  it('treats >7d-old newest as stale', () => {
    expect(fetcher.isStale([{ data: { created_utc: NOW - 8 * 24 * 3600 } }])).toBe(true)
  })
  it('treats fresh as not stale', () => {
    expect(fetcher.isStale([{ data: { created_utc: NOW - 60 } }])).toBe(false)
  })
})
