const { pool } = require('./index')

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY,
      name TEXT,
      email TEXT,
      handle TEXT,
      platform TEXT,
      followers TEXT,
      niche TEXT,
      reason TEXT,
      status TEXT DEFAULT 'trial',
      post_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS waitlist (
      id SERIAL PRIMARY KEY,
      email TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS affiliates (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Add columns to existing tables if they don't exist yet
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'trial';
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS post_url TEXT;
  `)
  console.log('Migration complete')
  await pool.end()
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
