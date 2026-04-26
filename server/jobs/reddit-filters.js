const ONE_DAY_MS = 24 * 60 * 60 * 1000

const EN_LEADS = /^[\s"'¿]*(how|what|why|when|where|which|who|can|could|should|would|do|does|did|is|are|was|were|will|any|anyone|anybody)(?!\p{L})/iu
const ES_LEADS = /^[\s"'¿]*(cómo|como|qué|que|por\s+qué|cuándo|cuando|dónde|donde|cuál|cual|quién|quien|puedo|puede|puedes|debería|deberia)(?!\p{L})/iu
const PT_LEADS = /^[\s"'¿]*(como|o\s+que|por\s+que|por\s+quê|quando|onde|qual|quem|posso|pode|deveria|tem)(?!\p{L})/iu

const REJECT_FLAIRS = new Set(['meme', 'humor', 'media', 'off-topic', 'shitpost'])
const SYSTEM_AUTHORS = new Set(['[deleted]', 'AutoModerator'])
const COPYRIGHT_PATTERNS = [
  /\blyrics?\b/i,
  /\btattoo\b/i,
  /\btranslat(e|ion|ing)\b.*\bsong\b/i,
  /\bsong\b.*\btranslat(e|ion|ing)\b/i,
  /\bhomework\b/i,
  /\bessay\b/i,
  /\bassignment\b/i,
]

function looksLikeQuestion(text) {
  const t = (text || '').trim()
  if (t.length < 3) return false
  if (/\?/.test(t)) return true
  return EN_LEADS.test(t) || ES_LEADS.test(t) || PT_LEADS.test(t)
}

function isCopyrightTopic(text) {
  const t = text || ''
  return COPYRIGHT_PATTERNS.some(rx => rx.test(t))
}

function olderThanHours(epochSec, hours) {
  if (!epochSec) return true
  return (Date.now() - epochSec * 1000) > hours * 60 * 60 * 1000
}

function permalinkToUrl(permalink) {
  if (!permalink) return ''
  if (permalink.startsWith('http')) return permalink
  return `https://www.reddit.com${permalink}`
}

function commentDeepLink(parentPostId, commentId) {
  return `https://www.reddit.com/comments/${parentPostId}/_/${commentId}`
}

function normalizePost(child) {
  const d = child && child.data
  if (!d) return null
  return {
    kind: 'post',
    thread_id: d.id,
    parent_id: null,
    subreddit: d.subreddit,
    author_handle: d.author,
    title: d.title || '',
    body: d.selftext || '',
    posted_at: d.created_utc ? new Date(d.created_utc * 1000) : null,
    score: typeof d.score === 'number' ? d.score : null,
    num_comments: typeof d.num_comments === 'number' ? d.num_comments : 0,
    thread_url: permalinkToUrl(d.permalink),
    _raw: d,
  }
}

function normalizeComment(child) {
  const d = child && child.data
  if (!d || d.body == null) return null
  const parentPostId = (d.link_id || '').replace(/^t3_/, '')
  return {
    kind: 'comment',
    thread_id: d.id,
    parent_id: parentPostId,
    subreddit: d.subreddit,
    author_handle: d.author,
    title: d.link_title || '',
    body: d.body || '',
    posted_at: d.created_utc ? new Date(d.created_utc * 1000) : null,
    score: typeof d.score === 'number' ? d.score : null,
    num_comments: typeof d.num_comments === 'number' ? d.num_comments : null,
    thread_url: d.permalink ? permalinkToUrl(d.permalink) : commentDeepLink(parentPostId, d.id),
    _raw: d,
  }
}

function rejectPost(p, dedupSet) {
  const d = p && p._raw
  if (!d) return 'no_data'
  if (dedupSet && dedupSet.has(d.id)) return 'dedup'
  if (!d.is_self) return 'not_self'
  if (d.stickied) return 'stickied'
  if (d.over_18) return 'nsfw'
  if (SYSTEM_AUTHORS.has(d.author)) return 'system_author'
  if (typeof d.score === 'number' && d.score < 0) return 'negative_score'
  if (olderThanHours(d.created_utc, 24)) return 'too_old'
  if ((d.num_comments || 0) > 8) return 'too_busy'
  const flair = (d.link_flair_text || '').toLowerCase().trim()
  if (flair && REJECT_FLAIRS.has(flair)) return 'bad_flair'
  const text = `${d.title || ''}\n${d.selftext || ''}`
  if (isCopyrightTopic(text)) return 'copyright'
  if (!looksLikeQuestion(text)) return 'no_question'
  return null
}

function rejectComment(c, dedupSet) {
  const d = c && c._raw
  if (!d) return 'no_data'
  if (dedupSet && dedupSet.has(d.id)) return 'dedup'
  if (SYSTEM_AUTHORS.has(d.author)) return 'system_author'
  if (typeof d.score === 'number' && d.score < 1) return 'low_score'
  if (olderThanHours(d.created_utc, 24)) return 'too_old'
  const body = d.body || ''
  if (body.length < 30) return 'too_short'
  if (body.length > 500) return 'too_long'
  if (isCopyrightTopic(body)) return 'copyright'
  if (!looksLikeQuestion(body)) return 'no_question'
  // parent post heuristic: noisy thread with low-score comment = flame-war territory
  const parentNumComments = typeof d.num_comments === 'number' ? d.num_comments : 0
  if (parentNumComments > 50 && (d.score || 0) < 3) return 'flame_war'
  return null
}

function filterPosts(rawChildren, dedupSet) {
  const out = []
  const drops = {}
  for (const child of rawChildren) {
    const norm = normalizePost(child)
    if (!norm) { drops.no_data = (drops.no_data || 0) + 1; continue }
    const reason = rejectPost(norm, dedupSet)
    if (reason) { drops[reason] = (drops[reason] || 0) + 1; continue }
    out.push(norm)
  }
  return { kept: out, drops }
}

function filterComments(rawChildren, dedupSet) {
  const out = []
  const drops = {}
  for (const child of rawChildren) {
    const norm = normalizeComment(child)
    if (!norm) { drops.no_data = (drops.no_data || 0) + 1; continue }
    const reason = rejectComment(norm, dedupSet)
    if (reason) { drops[reason] = (drops[reason] || 0) + 1; continue }
    out.push(norm)
  }
  return { kept: out, drops }
}

module.exports = {
  looksLikeQuestion,
  isCopyrightTopic,
  rejectPost,
  rejectComment,
  filterPosts,
  filterComments,
  normalizePost,
  normalizeComment,
  permalinkToUrl,
  commentDeepLink,
}
