jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn()
  return { Anthropic: jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } })) }
})

const { Anthropic } = require('@anthropic-ai/sdk')
const mockCreate = new Anthropic().messages.create
const { draftReplies } = require('../../server/jobs/digest-drafter')

beforeEach(() => { mockCreate.mockReset() })

describe('draftReplies', () => {
  it('returns input unchanged when empty', async () => {
    const out = await draftReplies([], { model: 'm' })
    expect(out).toEqual([])
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('attaches reply_draft and reply_draft_model to each comment', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify([
        { comment_id: 'c1', reply_draft: 'Try the 4-7-8 method.' },
        { comment_id: 'c2', reply_draft: 'Box breathing helps.' },
      ])}],
    })
    const input = [
      { comment_id: 'c1', commenter_handle: 'j', comment_text: 'how to relax?', _post_caption: 'sleep tips' },
      { comment_id: 'c2', commenter_handle: 'k', comment_text: 'best for focus?', _post_caption: 'focus tips' },
    ]
    const out = await draftReplies(input, { model: 'claude-haiku-4-5-20251001' })
    expect(out[0].reply_draft).toBe('Try the 4-7-8 method.')
    expect(out[0].reply_draft_model).toBe('claude-haiku-4-5-20251001')
    expect(out[1].reply_draft).toBe('Box breathing helps.')
  })

  it('batches in groups of 20', async () => {
    const input = Array.from({ length: 45 }, (_, i) => ({
      comment_id: `c${i}`, commenter_handle: 'u', comment_text: 'how?', _post_caption: '',
    }))
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(
        Array.from({ length: 20 }, (_, i) => ({ comment_id: `c${i}`, reply_draft: 'd' }))
      )}],
    })
    await draftReplies(input, { model: 'm' })
    expect(mockCreate).toHaveBeenCalledTimes(3)
  })

  it('falls back to empty draft when Claude returns malformed JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not json' }],
    })
    const input = [{ comment_id: 'c1', commenter_handle: 'j', comment_text: 'how?', _post_caption: '' }]
    const out = await draftReplies(input, { model: 'm' })
    expect(out[0].reply_draft).toBe('')
    expect(out[0].reply_draft_model).toBe('m')
  })

  it('survives Claude errors per batch', async () => {
    mockCreate.mockRejectedValueOnce(new Error('429'))
    const input = [{ comment_id: 'c1', commenter_handle: 'j', comment_text: 'how?', _post_caption: '' }]
    const out = await draftReplies(input, { model: 'm' })
    expect(out).toHaveLength(1)
    expect(out[0].reply_draft).toBe('')
  })
})
