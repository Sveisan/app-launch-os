const { filter } = require('../../../server/jobs/strategies/questions-v1')

const c = (text, extras = {}) => ({
  comment_id: 'x', commenter_handle: 'u', comment_text: text,
  comment_posted_at: null, ...extras
})

describe('questions-v1 filter', () => {
  it('keeps comments ending with ?', () => {
    const out = filter([c('how do I do box breathing?')])
    expect(out).toHaveLength(1)
    expect(out[0].relevance_strategy).toBe('questions_v1')
    expect(out[0].relevance_score).toBeNull()
  })

  it('keeps English question-word leads', () => {
    expect(filter([c('What app do you use')]).length).toBe(1)
    expect(filter([c('Can this help with panic attacks')]).length).toBe(1)
  })

  it('keeps Spanish question forms', () => {
    expect(filter([c('¿Cómo respirar mejor?')]).length).toBe(1)
    expect(filter([c('qué hacer cuando no puedo dormir')]).length).toBe(1)
  })

  it('keeps Portuguese question forms', () => {
    expect(filter([c('como faço respiração de caixa?')]).length).toBe(1)
    expect(filter([c('o que voce recomenda')]).length).toBe(1)
  })

  it('rejects emoji-only', () => {
    expect(filter([c('🔥🔥🔥')])).toEqual([])
  })

  it('rejects affirmations and noise', () => {
    expect(filter([c('love this')])).toEqual([])
    expect(filter([c('first!')])).toEqual([])
    expect(filter([c('check my profile')])).toEqual([])
    expect(filter([c('amazing')])).toEqual([])
  })

  it('rejects empty/whitespace', () => {
    expect(filter([c('')])).toEqual([])
    expect(filter([c('   ')])).toEqual([])
  })

  it('returns the original comment fields plus strategy metadata', () => {
    const input = c('how does this work?', { comment_id: 'abc', commenter_handle: 'jane' })
    const [out] = filter([input])
    expect(out.comment_id).toBe('abc')
    expect(out.commenter_handle).toBe('jane')
    expect(out.comment_text).toBe('how does this work?')
    expect(out.relevance_strategy).toBe('questions_v1')
    expect(out.relevance_score).toBeNull()
  })
})
