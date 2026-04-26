jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn()
  return { Anthropic: jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } })) }
})

const { Anthropic } = require('@anthropic-ai/sdk')
const mockCreate = new Anthropic().messages.create
const { judgeAndDraft, parseDecisions } = require('../../server/jobs/reddit-judge')

beforeEach(() => { mockCreate.mockReset() })

describe('parseDecisions', () => {
  it('parses a clean JSON array', () => {
    const out = parseDecisions(JSON.stringify([
      { thread_id: 't1', keep: true, contains_pitch: false, draft: 'Try the physiological sigh.' },
    ]))
    expect(out.t1.keep).toBe(true)
    expect(out.t1.draft).toBe('Try the physiological sigh.')
  })
  it('strips markdown fences', () => {
    const out = parseDecisions('```json\n[{"thread_id":"t1","keep":true,"contains_pitch":false,"draft":"x"}]\n```')
    expect(out.t1.keep).toBe(true)
  })
  it('extracts the first array from prose-wrapped output', () => {
    const out = parseDecisions('Sure here you go: [{"thread_id":"t1","keep":true,"contains_pitch":false,"draft":"x"}] thanks')
    expect(out.t1.keep).toBe(true)
  })
  it('returns empty on garbage', () => {
    expect(parseDecisions('not json')).toEqual({})
  })
})

describe('judgeAndDraft', () => {
  it('returns [] for empty input', async () => {
    const out = await judgeAndDraft([], { model: 'm' })
    expect(out).toEqual([])
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('drops keep:false and items with empty drafts', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify([
        { thread_id: 't1', keep: true, contains_pitch: false, draft: 'helpful' },
        { thread_id: 't2', keep: false, contains_pitch: false, draft: '' },
        { thread_id: 't3', keep: true, contains_pitch: true, draft: '' },
      ])}],
    })
    const input = [
      { thread_id: 't1', kind: 'post', subreddit: 'x', title: 't', body: 'b' },
      { thread_id: 't2', kind: 'post', subreddit: 'x', title: 't', body: 'b' },
      { thread_id: 't3', kind: 'post', subreddit: 'x', title: 't', body: 'b' },
    ]
    const out = await judgeAndDraft(input, { model: 'm' })
    expect(out).toHaveLength(1)
    expect(out[0].thread_id).toBe('t1')
    expect(out[0].draft_reply).toBe('helpful')
    expect(out[0].draft_contains_pitch).toBe(false)
    expect(out[0].draft_model).toBe('m')
    expect(out[0].draft_generated_at).toBeInstanceOf(Date)
  })

  it('survives Claude errors per batch', async () => {
    mockCreate.mockRejectedValueOnce(new Error('429'))
    const out = await judgeAndDraft([
      { thread_id: 't1', kind: 'post', subreddit: 'x', title: 't', body: 'b' },
    ], { model: 'm' })
    expect(out).toEqual([])
  })

  it('batches in groups of 10', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(
        Array.from({ length: 10 }, (_, i) => ({ thread_id: 't' + i, keep: false, contains_pitch: false, draft: '' }))
      )}],
    })
    const input = Array.from({ length: 25 }, (_, i) => ({
      thread_id: 't' + i, kind: 'post', subreddit: 'x', title: 't', body: 'b',
    }))
    await judgeAndDraft(input, { model: 'm' })
    expect(mockCreate).toHaveBeenCalledTimes(3)
  })
})
