const config = require('../../config/app')

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

class RedditRateLimitError extends Error {
  constructor(msg) { super(msg); this.code = 'REDDIT_RATE_LIMIT' }
}

async function _fetchJson(url, { signal } = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': config.reddit.userAgent,
      'Accept': 'application/json',
    },
    signal,
  })
  if (res.status === 429) throw new RedditRateLimitError(`429 from ${url}`)
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
  return res.json()
}

function withTimeout(ms) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) }
}

function newestCreatedUtc(items) {
  let max = 0
  for (const it of items) {
    const c = it && it.data && it.data.created_utc
    if (typeof c === 'number' && c > max) max = c
  }
  return max
}

function isStale(items) {
  const newest = newestCreatedUtc(items)
  if (!newest) return true
  return (Date.now() - newest * 1000) > SEVEN_DAYS_MS
}

async function fetchListing(url, { allowRetry = true } = {}) {
  const t = withTimeout(config.reddit.requestTimeoutMs)
  let json
  try {
    json = await _fetchJson(url, { signal: t.signal })
  } finally {
    t.clear()
  }
  const items = (json && json.data && json.data.children) || []
  if (allowRetry && isStale(items)) {
    await new Promise(r => setTimeout(r, config.reddit.staleCacheRetryMs))
    const t2 = withTimeout(config.reddit.requestTimeoutMs)
    try {
      json = await _fetchJson(url, { signal: t2.signal })
    } finally {
      t2.clear()
    }
    const items2 = (json && json.data && json.data.children) || []
    if (isStale(items2)) {
      const err = new Error(`stale cache for ${url}`)
      err.code = 'REDDIT_STALE_CACHE'
      throw err
    }
    return items2
  }
  return items
}

function postsUrl(sub, limit = 50) {
  return `https://www.reddit.com/r/${encodeURIComponent(sub)}/new.json?limit=${limit}&raw_json=1`
}

function commentsUrl(sub, limit = 100) {
  return `https://www.reddit.com/r/${encodeURIComponent(sub)}/comments.json?limit=${limit}&raw_json=1`
}

async function fetchPosts(sub, opts) { return fetchListing(postsUrl(sub, opts && opts.limit), opts) }
async function fetchComments(sub, opts) { return fetchListing(commentsUrl(sub, opts && opts.limit), opts) }

module.exports = {
  fetchPosts,
  fetchComments,
  fetchListing,
  postsUrl,
  commentsUrl,
  isStale,
  RedditRateLimitError,
}
