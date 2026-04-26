const { Anthropic } = require('@anthropic-ai/sdk')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const BATCH_SIZE = 20

const SYSTEM_PROMPT = `You are the Breathe Collection community voice — calm, evidence-led, generous.
Reply to each comment so the commenter feels heard and gets useful, specific value.
Constraints (hard):
- Under 280 characters per reply.
- No emojis unless the original comment used them.
- No links.
- Plain language. No marketing.
- End with a question or invitation only when natural.
Return ONLY JSON: an array of {"comment_id": string, "reply_draft": string}. No prose, no markdown.`

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function buildUserPrompt(batch) {
  return [
    'Draft replies for these comments. Each item shows the post context the commenter saw.',
    '',
    JSON.stringify(batch.map(c => ({
      comment_id: c.comment_id,
      post_caption: (c._post_caption || '').slice(0, 300),
      commenter_handle: c.commenter_handle,
      comment_text: c.comment_text,
    })), null, 2),
  ].join('\n')
}

function parseDrafts(text) {
  if (!text) return {}
  let str = text.trim()
  const fenceMatch = str.match(/```(?:json)?\s*([\s\S]+?)```/)
  if (fenceMatch) str = fenceMatch[1].trim()
  try {
    const arr = JSON.parse(str)
    if (!Array.isArray(arr)) return {}
    const out = {}
    for (const r of arr) {
      if (r && typeof r.comment_id === 'string') {
        out[r.comment_id] = String(r.reply_draft || '')
      }
    }
    return out
  } catch {
    return {}
  }
}

async function draftBatch(batch, model) {
  try {
    const resp = await anthropic.messages.create({
      model,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(batch) }],
    })
    const text = resp.content && resp.content[0] && resp.content[0].text
    return parseDrafts(text)
  } catch (err) {
    console.error('[digest-drafter] batch failed:', err.message)
    return {}
  }
}

async function draftReplies(comments, { model }) {
  if (!comments.length) return []
  const batches = chunk(comments, BATCH_SIZE)
  const drafts = {}
  for (const b of batches) {
    Object.assign(drafts, await draftBatch(b, model))
  }
  return comments.map(c => ({
    ...c,
    reply_draft: drafts[c.comment_id] || '',
    reply_draft_model: model,
  }))
}

module.exports = { draftReplies, BATCH_SIZE, SYSTEM_PROMPT }
