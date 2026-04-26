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
}
