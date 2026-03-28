require('dotenv').config()

module.exports = {
  appName: 'Breathe Collection',
  supportEmail: 'support@breathecollection.app',
  fromEmail: 'noreply@breathecollection.app',
  resend: {
    apiKey: process.env.RESEND_API_KEY,
  },
  db: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },
}
