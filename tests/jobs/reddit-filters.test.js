const {
  looksLikeQuestion,
  isCopyrightTopic,
  filterPosts,
  filterComments,
  normalizePost,
  normalizeComment,
  permalinkToUrl,
  commentDeepLink,
} = require('../../server/jobs/reddit-filters')

const NOW = Math.floor(Date.now() / 1000)
const HOURS = h => NOW - h * 3600

const post = (overrides = {}) => ({
  data: {
    id: 'p1',
    title: 'How do I stop panic attacks at night?',
    selftext: 'This has been going on for weeks. Anyone got tips?',
    permalink: '/r/Anxiety/comments/p1/x/',
    subreddit: 'Anxiety',
    author: 'someone',
    is_self: true,
    stickied: false,
    over_18: false,
    score: 5,
    num_comments: 2,
    created_utc: HOURS(2),
    link_flair_text: null,
    ...overrides,
  },
})

const comment = (overrides = {}) => ({
  data: {
    id: 'c1',
    body: 'How long does the physiological sigh take to actually calm you down?',
    link_id: 't3_p1',
    link_title: 'breathing techniques',
    permalink: '/r/HubermanLab/comments/p1/x/c1/',
    subreddit: 'HubermanLab',
    author: 'someone',
    score: 3,
    num_comments: 5,
    created_utc: HOURS(2),
    ...overrides,
  },
})

describe('looksLikeQuestion', () => {
  it('keeps text ending in ?', () => {
    expect(looksLikeQuestion('does this work?')).toBe(true)
  })
  it('keeps EN/ES/PT question leads without ?', () => {
    expect(looksLikeQuestion('How can I stop')).toBe(true)
    expect(looksLikeQuestion('¿Cómo respiro mejor')).toBe(true)
    expect(looksLikeQuestion('Como faço para dormir')).toBe(true)
    expect(looksLikeQuestion('Anyone use this')).toBe(true)
  })
  it('rejects affirmations', () => {
    expect(looksLikeQuestion('this is amazing')).toBe(false)
    expect(looksLikeQuestion('first!')).toBe(false)
    expect(looksLikeQuestion('')).toBe(false)
  })
})

describe('isCopyrightTopic', () => {
  it('flags lyrics, tattoos, song-translation, homework', () => {
    expect(isCopyrightTopic('what do these lyrics mean')).toBe(true)
    expect(isCopyrightTopic('tattoo translation help')).toBe(true)
    expect(isCopyrightTopic('translate this song please')).toBe(true)
    expect(isCopyrightTopic('homework help due tomorrow')).toBe(true)
    expect(isCopyrightTopic('how do I breathe')).toBe(false)
  })
})

describe('filterPosts', () => {
  it('keeps a clean self post asking a question', () => {
    const { kept, drops } = filterPosts([post()], new Set())
    expect(kept).toHaveLength(1)
    expect(drops).toEqual({})
    expect(kept[0].kind).toBe('post')
    expect(kept[0].thread_id).toBe('p1')
  })
  it('rejects link posts', () => {
    const { kept, drops } = filterPosts([post({ is_self: false })], new Set())
    expect(kept).toHaveLength(0)
    expect(drops.not_self).toBe(1)
  })
  it('rejects stickied/nsfw/system author/old/busy/bad-flair/no-question/copyright/dedup', () => {
    const cases = [
      ['stickied', { stickied: true }],
      ['nsfw', { over_18: true }],
      ['system_author', { author: '[deleted]' }],
      ['too_old', { created_utc: HOURS(48) }],
      ['too_busy', { num_comments: 50 }],
      ['bad_flair', { link_flair_text: 'meme' }],
      ['no_question', { title: 'Just sharing my journey', selftext: 'no questions here today.' }],
      ['copyright', { title: 'tattoo translation', selftext: 'help?' }],
    ]
    for (const [reason, overrides] of cases) {
      const { kept, drops } = filterPosts([post(overrides)], new Set())
      expect(kept).toHaveLength(0)
      expect(drops[reason]).toBe(1)
    }
    const { kept, drops } = filterPosts([post()], new Set(['p1']))
    expect(kept).toHaveLength(0)
    expect(drops.dedup).toBe(1)
  })
})

describe('filterComments', () => {
  it('keeps a clean question comment', () => {
    const { kept } = filterComments([comment()], new Set())
    expect(kept).toHaveLength(1)
    expect(kept[0].kind).toBe('comment')
    expect(kept[0].parent_id).toBe('p1')
  })
  it('rejects too short / too long / no question / low score / system / old / dedup / flame war', () => {
    const cases = [
      ['too_short', { body: 'how?' }],
      ['too_long', { body: 'how ' + 'a'.repeat(600) + '?' }],
      ['no_question', { body: 'love this so much, really helps me out a lot honestly' }],
      ['low_score', { score: 0 }],
      ['system_author', { author: 'AutoModerator' }],
      ['too_old', { created_utc: HOURS(48) }],
      ['flame_war', { num_comments: 100, score: 1 }],
    ]
    for (const [reason, overrides] of cases) {
      const { kept, drops } = filterComments([comment(overrides)], new Set())
      expect(kept).toHaveLength(0)
      expect(drops[reason]).toBe(1)
    }
    const { kept, drops } = filterComments([comment()], new Set(['c1']))
    expect(kept).toHaveLength(0)
    expect(drops.dedup).toBe(1)
  })
})

describe('normalizers', () => {
  it('builds proper URLs', () => {
    const p = normalizePost(post())
    expect(p.thread_url).toBe('https://www.reddit.com/r/Anxiety/comments/p1/x/')
    const c = normalizeComment(comment({ permalink: null }))
    expect(c.thread_url).toBe(commentDeepLink('p1', 'c1'))
    expect(permalinkToUrl('/r/x/y/')).toBe('https://www.reddit.com/r/x/y/')
  })
})
