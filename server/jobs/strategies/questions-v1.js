const NAME = 'questions_v1'

// English question-word leads (whole-word match at the start, after optional punctuation/quotes).
// Use a Unicode-aware lookahead instead of \b so accented words (e.g. qué) are bounded correctly.
const EN_LEADS = /^[\s"'¿]*(how|what|why|when|where|which|who|can|could|should|would|do|does|did|is|are|was|were|will)(?!\p{L})/iu

// Spanish question-word leads (with or without leading ¿)
const ES_LEADS = /^[\s"'¿]*(cómo|como|qué|que|por\s+qué|cuándo|cuando|dónde|donde|cuál|cual|quién|quien|puedo|puede|puedes|debería|deberia)(?!\p{L})/iu

// Portuguese question-word leads
const PT_LEADS = /^[\s"'¿]*(como|o\s+que|por\s+que|por\s+quê|quando|onde|qual|quem|posso|pode|deveria|tem)(?!\p{L})/iu

function looksLikeQuestion(text) {
  const trimmed = text.trim()
  if (trimmed.length < 3) return false
  if (/\?\s*$/.test(trimmed)) return true
  return EN_LEADS.test(trimmed) || ES_LEADS.test(trimmed) || PT_LEADS.test(trimmed)
}

function filter(comments) {
  return comments
    .filter(c => looksLikeQuestion(c.comment_text || ''))
    .map(c => ({ ...c, relevance_strategy: NAME, relevance_score: null }))
}

module.exports = { name: NAME, filter }
