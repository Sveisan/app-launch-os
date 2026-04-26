const { Anthropic } = require('@anthropic-ai/sdk')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const BATCH_SIZE = 10

const SYSTEM_PROMPT = `You triage Reddit threads for the Breathe Collection team. Breathe Collection is a science-led, anti-gamification breathwork app: no streaks, no points, no badges, validated protocols (box breathing, physiological sigh, Wim Hof, CO2 tolerance, etc.) designed to be used eyes-closed with haptic guidance.

For each thread, decide:
1. keep (boolean) — true ONLY if a real human asked a real question Breathe Collection can usefully answer. Reject: off-topic, lyrics/tattoos/song-translation/homework, low-effort dumps, argumentative threads, OR threads already answered well in the comments (use your judgment from the body alone — when uncertain, reject).
2. contains_pitch (boolean) — true ONLY if OP literally asked "what app/tool should I use" or equivalent product-recommendation language. Otherwise false.
3. draft (string, 2-4 sentences) — a helpful, direct answer in real Reddit voice. Hard constraints:
   - NO em-dashes. Use commas, parentheses, or two short sentences.
   - NO numbered or bulleted lists. NO "in conclusion / moreover / furthermore".
   - NO marketing language. NO links.
   - It's fine to start a sentence with "So" or "But" — that's how people write here.
   - If contains_pitch is false, do NOT mention Breathe Collection at all. Stay generic and useful.
   - If contains_pitch is true, you may mention it in passing, calmly, once.
   - If the thread is in a language other than English, reply in that language and add an English translation in (parentheses) at the end.

Return ONLY a JSON array, no prose, no markdown:
[{"thread_id": "...", "keep": true|false, "contains_pitch": true|false, "draft": "..."}]
Include one entry per input thread, in the same order.`

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function buildUserPrompt(batch) {
  const items = batch.map(c => ({
    thread_id: c.thread_id,
    kind: c.kind,
    subreddit: c.subreddit,
    title: (c.title || '').slice(0, 200),
    body: (c.body || '').slice(0, 1200),
  }))
  return [
    'Triage these Reddit threads. Return one JSON object per input, in order.',
    '',
    JSON.stringify(items, null, 2),
  ].join('\n')
}

function parseDecisions(text) {
  if (!text) return {}
  let str = text.trim()
  const fence = str.match(/```(?:json)?\s*([\s\S]+?)```/)
  if (fence) str = fence[1].trim()
  // tolerate extra prose: pull the first array
  const arrMatch = str.match(/\[[\s\S]*\]/)
  if (arrMatch) str = arrMatch[0]
  try {
    const arr = JSON.parse(str)
    if (!Array.isArray(arr)) return {}
    const out = {}
    for (const r of arr) {
      if (r && typeof r.thread_id === 'string') {
        out[r.thread_id] = {
          keep: r.keep === true,
          contains_pitch: r.contains_pitch === true,
          draft: typeof r.draft === 'string' ? r.draft : '',
        }
      }
    }
    return out
  } catch {
    return {}
  }
}

async function judgeBatch(batch, model) {
  try {
    const resp = await anthropic.messages.create({
      model,
      max_tokens: 2400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(batch) }],
    })
    const text = resp && resp.content && resp.content[0] && resp.content[0].text
    return parseDecisions(text)
  } catch (err) {
    console.error('[reddit-judge] batch failed:', err.message)
    return {}
  }
}

async function judgeAndDraft(candidates, { model }) {
  if (!candidates.length) return []
  const decisions = {}
  for (const b of chunk(candidates, BATCH_SIZE)) {
    Object.assign(decisions, await judgeBatch(b, model))
  }
  const out = []
  for (const c of candidates) {
    const d = decisions[c.thread_id]
    if (!d || !d.keep) continue
    if (!d.draft || !d.draft.trim()) continue
    out.push({
      ...c,
      draft_reply: d.draft.trim(),
      draft_contains_pitch: d.contains_pitch === true,
      draft_model: model,
      draft_generated_at: new Date(),
    })
  }
  return out
}

module.exports = { judgeAndDraft, parseDecisions, BATCH_SIZE, SYSTEM_PROMPT }
