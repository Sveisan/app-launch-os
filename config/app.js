require('dotenv').config()

module.exports = {
  appName: 'Breathe Collection',
  supportEmail: 'support@breathecollection.app',
  fromEmail: 'noreply@breathecollection.app',
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
}
