const config = require('../../config/app')

const APIFY_BASE = 'https://api.apify.com/v2'
const TIMEOUT_SECS = 90
const QUOTA_TAG = 'APIFY_QUOTA_EXCEEDED'

async function runActor(actorId, input) {
  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?timeout=${TIMEOUT_SECS}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apify.apiToken}`,
    },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    if (res.status === 402 || res.status === 429) {
      throw new Error(`${QUOTA_TAG}: Apify ${res.status} for ${actorId} (usage limit or rate limit)`)
    }
    throw new Error(`Apify responded ${res.status} for ${actorId}`)
  }
  return res.json()
}

async function getInstagramFollowers(handle) {
  const username = handle.replace(/^@/, '').toLowerCase()
  const data = await runActor('apify~instagram-profile-scraper', { usernames: [username] })
  if (!data || !data[0]) throw new Error('Instagram profile not found')
  const count = data[0].followersCount
  if (count == null) {
    console.warn('[platforms] Instagram: expected followersCount, got undefined. Keys:', Object.keys(data[0]))
    throw new Error('Instagram follower count field missing — actor response may have changed')
  }
  return count
}

async function getTikTokFollowers(handle) {
  const username = handle.replace(/^@/, '').toLowerCase()
  const data = await runActor('clockworks~tiktok-scraper', {
    profiles: [`https://www.tiktok.com/@${username}`],
    resultsType: 'details',
    maxProfilesPerQuery: 1,
  })
  if (!data || !data[0]) throw new Error('TikTok profile not found')
  const d = data[0]
  const count = d.fans ?? d.followerCount ?? d.stats?.followerCount ?? null
  if (count == null) {
    console.warn('[platforms] TikTok: no known follower field found. Keys:', Object.keys(d))
    throw new Error('TikTok follower count field missing — actor response may have changed')
  }
  return count
}

async function getXFollowers(handle) {
  const username = handle.replace(/^@/, '')
  const data = await runActor('quacker~twitter-url-scraper', {
    startUrls: [{ url: `https://twitter.com/${username}` }],
    maximumItems: 1,
  })
  if (!data || !data[0]) throw new Error('X profile not found')
  const d = data[0]
  const count = d.author?.followersCount ?? d.followersCount ?? null
  if (count == null) {
    console.warn('[platforms] X: no known follower field found. Keys:', Object.keys(d))
    throw new Error('X follower count field missing — actor response may have changed')
  }
  return count
}

async function getYouTubeFollowers(handle) {
  const username = handle.replace(/^@/, '')
  const data = await runActor('streamers~youtube-scraper', {
    startUrls: [{ url: `https://www.youtube.com/@${username}` }],
    maxResults: 1,
  })
  if (!data || !data[0]) throw new Error('YouTube channel not found')
  const d = data[0]
  const count = d.numberOfSubscribers ?? d.subscriberCount ?? null
  if (count == null) {
    console.warn('[platforms] YouTube: no known subscriber field found. Keys:', Object.keys(d))
    throw new Error('YouTube subscriber count field missing — actor response may have changed')
  }
  return count
}

async function getFollowers(platform, handle) {
  switch (platform) {
    case 'instagram': return getInstagramFollowers(handle)
    case 'tiktok':    return getTikTokFollowers(handle)
    case 'x':         return getXFollowers(handle)
    case 'youtube':   return getYouTubeFollowers(handle)
    case 'onlyfans':  return null // auto-approve
    default: throw new Error(`Unsupported platform: ${platform}`)
  }
}

async function getInstagramRecentPosts(handle, sinceHours) {
  const username = handle.replace(/^@/, '').toLowerCase()
  const data = await runActor('apify~instagram-profile-scraper', { usernames: [username] })
  if (!data || !data[0]) return []
  const profile = data[0]
  if (!Array.isArray(profile.latestPosts)) {
    console.warn('[platforms] Instagram posts: latestPosts missing or not an array. Keys:', Object.keys(profile))
    throw new Error('Instagram latestPosts field missing — actor response may have changed')
  }
  const latest = profile.latestPosts
  const cutoff = Date.now() - sinceHours * 3600 * 1000
  return latest
    .map(p => ({
      platform: 'instagram',
      post_id: String(p.id || p.shortCode || ''),
      post_url: p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : (p.url || ''),
      caption: p.caption || '',
      thumbnail_url: p.displayUrl || p.thumbnailUrl || '',
      published_at: p.timestamp ? new Date(p.timestamp) : null,
    }))
    .filter(p => p.post_id && p.published_at && p.published_at.getTime() >= cutoff)
}

async function getTikTokRecentPosts(handle, sinceHours) {
  const username = handle.replace(/^@/, '').toLowerCase()
  const data = await runActor('clockworks~tiktok-scraper', {
    profiles: [`https://www.tiktok.com/@${username}`],
    resultsPerPage: 20,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  })
  if (!Array.isArray(data)) {
    console.warn('[platforms] TikTok posts: expected array, got:', typeof data)
    throw new Error('TikTok recent posts response shape unexpected — actor response may have changed')
  }
  const cutoff = Date.now() - sinceHours * 3600 * 1000
  return data
    .map(v => ({
      platform: 'tiktok',
      post_id: String(v.id || ''),
      post_url: v.webVideoUrl || `https://www.tiktok.com/@${username}/video/${v.id}`,
      caption: v.text || v.desc || '',
      thumbnail_url: (v.videoMeta && v.videoMeta.coverUrl) || v.coverUrl || '',
      published_at: v.createTimeISO ? new Date(v.createTimeISO)
        : (v.createTime ? new Date(v.createTime * 1000) : null),
    }))
    .filter(p => p.post_id && p.published_at && p.published_at.getTime() >= cutoff)
}

async function getRecentPosts(platform, handle, { sinceHours = 24 } = {}) {
  switch (platform) {
    case 'instagram': return getInstagramRecentPosts(handle, sinceHours)
    case 'tiktok':    return getTikTokRecentPosts(handle, sinceHours)
    default: throw new Error(`Unsupported platform: ${platform}`)
  }
}

async function getInstagramPostComments(postUrl, limit) {
  const data = await runActor('apify~instagram-comment-scraper', {
    directUrls: [postUrl],
    resultsLimit: limit,
  })
  if (!Array.isArray(data)) {
    console.warn('[platforms] Instagram comments: expected array, got:', typeof data)
    throw new Error('Instagram comments response shape unexpected — actor response may have changed')
  }
  return data.map(c => ({
    comment_id: String(c.id || ''),
    commenter_handle: c.ownerUsername || c.owner?.username || '',
    comment_text: c.text || '',
    comment_posted_at: c.timestamp ? new Date(c.timestamp) : null,
  })).filter(c => c.comment_id)
}

async function getTikTokPostComments(postUrl, limit) {
  const data = await runActor('clockworks~tiktok-comments-scraper', {
    postURLs: [postUrl],
    commentsPerPost: limit,
  })
  if (!Array.isArray(data)) {
    console.warn('[platforms] TikTok comments: expected array, got:', typeof data)
    throw new Error('TikTok comments response shape unexpected — actor response may have changed')
  }
  return data.map(c => ({
    comment_id: String(c.cid || c.id || ''),
    commenter_handle: c.uniqueId || c.user?.uniqueId || '',
    comment_text: c.text || '',
    comment_posted_at: c.createTimeISO ? new Date(c.createTimeISO)
      : (c.createTime ? new Date(c.createTime * 1000) : null),
  })).filter(c => c.comment_id)
}

async function getPostComments(platform, postId, { postUrl, limit = 100 } = {}) {
  if (!postUrl) throw new Error('getPostComments requires postUrl')
  let raw
  switch (platform) {
    case 'instagram': raw = await getInstagramPostComments(postUrl, limit); break
    case 'tiktok':    raw = await getTikTokPostComments(postUrl, limit); break
    default: throw new Error(`Unsupported platform: ${platform}`)
  }
  return raw.map(c => ({
    platform,
    post_id: postId,
    ...c,
  }))
}

module.exports = { getFollowers, getRecentPosts, getPostComments, QUOTA_TAG }
