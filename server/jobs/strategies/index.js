const questionsV1 = require('./questions-v1')

const STRATEGIES = {
  [questionsV1.name]: questionsV1,
}

function getStrategy(name) {
  const s = STRATEGIES[name]
  if (!s) throw new Error(`Unknown relevance strategy: ${name}`)
  return s
}

module.exports = { getStrategy, STRATEGIES }
