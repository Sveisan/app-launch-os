require('dotenv').config()

module.exports = {
  appName: 'Breathe Collection',
  supportEmail: 'support@breathecollection.app',
  fromEmail: 'support@breathecollection.app',
  resend: {
    apiKey: process.env.RESEND_API_KEY,
  },
  apify: {
    apiToken: process.env.APIFY_API_TOKEN,
  },
  scout: {
    // Set SCOUT_ENABLED=false to pause the Scout agent's Apify discovery
    // sweeps without affecting the creator self-service eligibility check
    // (which uses a separate Apify code path in server/platforms/index.js).
    enabled: process.env.SCOUT_ENABLED !== 'false',
  },
  eligibility: {
    followerThreshold: 500,
  },
  db: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },
  digest: {
    recipient: process.env.DIGEST_RECIPIENT || 'support@breathecollection.app',
    cron: process.env.DIGEST_CRON || '0 6 * * *',
    relevanceStrategy: process.env.DIGEST_RELEVANCE_STRATEGY || 'questions_v1',
    maxCommentsPerPost: parseInt(process.env.DIGEST_MAX_COMMENTS_PER_POST, 10) || 100,
    replyDraftModel: process.env.DIGEST_REPLY_MODEL || 'claude-haiku-4-5-20251001',
    digestUrlBase: process.env.DIGEST_URL_BASE || 'http://localhost:3000',
  },
  reddit: {
    cron: process.env.REDDIT_CRON || '0 */6 * * *',
    maxCandidatesPerRun: parseInt(process.env.REDDIT_MAX_CANDIDATES, 10) || 10,
    judgeModel: process.env.REDDIT_JUDGE_MODEL || 'claude-haiku-4-5-20251001',
    contactEmail: process.env.REDDIT_CONTACT_EMAIL || 'support@breathecollection.app',
    userAgent: process.env.REDDIT_USER_AGENT
      || `node:breathe-collection:1.0 (contact: ${process.env.REDDIT_CONTACT_EMAIL || 'support@breathecollection.app'})`,
    requestTimeoutMs: parseInt(process.env.REDDIT_REQUEST_TIMEOUT_MS, 10) || 10000,
    staleCacheRetryMs: parseInt(process.env.REDDIT_STALE_CACHE_RETRY_MS, 10) || 30000,
  },
  freeEventDeadline: process.env.FREE_EVENT_DEADLINE || '2026-05-31T23:59:00+02:00',
}
