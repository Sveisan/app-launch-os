const config = require('../../config/app')

const APIFY_BASE = 'https://api.apify.com/v2'
const TIMEOUT_SECS = 90

async function runActor(actorId, input) {
  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${config.apify.apiToken}&timeout=${TIMEOUT_SECS}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(`Apify responded ${res.status} for ${actorId}`)
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

module.exports = { getFollowers }
