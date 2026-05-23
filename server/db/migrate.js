const { pool } = require('./index')

async function migrate() {
  // Bail out fast if DB is unreachable so the app can still start and serve static pages.
  try {
    const client = await Promise.race([
      pool.connect(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('DB connect timeout (10s)')), 10000))
    ])
    client.release()
  } catch (err) {
    console.warn('[migrate] DB unreachable, skipping migration:', err.message)
    console.warn('[migrate] Server will start anyway; DB-backed routes will return errors until DB is back.')
    await pool.end().catch(() => {})
    return
  }

  await pool.query('SET statement_timeout = 30000')
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

    CREATE TABLE IF NOT EXISTS offer_codes (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      is_used BOOLEAN DEFAULT FALSE,
      used_by_email TEXT,
      used_at TIMESTAMPTZ,
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

    CREATE TABLE IF NOT EXISTS content (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,           -- 'technique' | 'use-case' | 'faq-cluster'
      title TEXT NOT NULL,
      meta_title TEXT NOT NULL,
      meta_description TEXT NOT NULL,
      content_json JSONB NOT NULL,  -- structured content
      schema_json JSONB NOT NULL,   -- schema.org JSON-LD
      published BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Add columns to existing tables if they don't exist yet
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'trial';
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS post_url TEXT;

    -- Issue #3: split followers TEXT into typed columns
    -- followers TEXT is kept for backwards compatibility; new code writes to followers_count + auto_approved
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS followers_count INTEGER;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN DEFAULT FALSE;

    -- Scout Agent Fields
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS fit_score DECIMAL(3,2);
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS engagement_rate DECIMAL(5,2);
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS outreach_draft TEXT;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS scout_logged BOOLEAN DEFAULT FALSE;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS fit_feedback TEXT;
    
    -- Kanban / Pipeline Status
    -- discovery (default), researching, approved, outreach_sent, rejected
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pipeline_status TEXT DEFAULT 'discovery';
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS freelancer_notes TEXT;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS manually_added BOOLEAN DEFAULT FALSE;

    -- System Logs for Scout Agent
    CREATE TABLE IF NOT EXISTS scout_logs (
      id SERIAL PRIMARY KEY,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Scout Keywords for Multi-language Search
    CREATE TABLE IF NOT EXISTS scout_keywords (
      id SERIAL PRIMARY KEY,
      keyword TEXT UNIQUE NOT NULL,
      language TEXT NOT NULL,
      is_hashtag BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      yield_score DECIMAL DEFAULT 0.5,
      last_used_at TIMESTAMPTZ
    );

    -- Add tracking columns if they don't exist
    ALTER TABLE scout_keywords ADD COLUMN IF NOT EXISTS yield_score DECIMAL DEFAULT 0.5;
    ALTER TABLE scout_keywords ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

    -- New keywords for tighter ICP targeting
    DELETE FROM scout_keywords WHERE keyword IN (
      'meditation', 'meditacion', 'mindfulness', 'wellness', 'bienestar',
      'healthylifestyle', 'yoga'
    );

    INSERT INTO scout_keywords (keyword, language, is_hashtag) VALUES
      ('panicattacks', 'en', TRUE),
      ('sleepanxiety', 'en', TRUE),
      ('hubermanlab', 'en', TRUE),
      ('nervoussystem', 'en', TRUE),
      ('nosebreathing', 'en', TRUE),
      ('mouthbreathing', 'en', TRUE),
      ('anxietyattack', 'en', TRUE),
      ('stressresponse', 'en', TRUE),
      ('coldplunge', 'en', TRUE),
      ('nervoussystemregulation', 'en', TRUE)
    ON CONFLICT (keyword) DO NOTHING;

    -- Keyword Suggestions table for feedback loop
    CREATE TABLE IF NOT EXISTS scout_keyword_suggestions (
      id SERIAL PRIMARY KEY,
      keyword TEXT UNIQUE NOT NULL,
      suggestion_count INTEGER DEFAULT 1,
      first_seen_at TIMESTAMPTZ DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Seed initial keywords if empty
    INSERT INTO scout_keywords (keyword, language, is_hashtag)
    VALUES 
      ('breathwork', 'en', TRUE), ('breathing', 'en', TRUE), ('wimhof', 'en', TRUE), 
      ('boxbreathing', 'en', TRUE), ('physiologicalsigh', 'en', TRUE), ('biohacking', 'en', TRUE),
      ('sleephacks', 'en', TRUE), ('huberman', 'en', TRUE), ('stressrelief', 'en', TRUE), 
      ('recovery', 'en', TRUE), ('anxietyrelief', 'en', TRUE), ('burnout', 'en', TRUE), 
      ('insomnia', 'en', TRUE), ('panicattack', 'en', TRUE), ('mentalhealth', 'en', TRUE), 
      ('stressmanagement', 'en', TRUE), ('productivityhacks', 'en', TRUE), ('focus', 'en', TRUE), 
      ('flowstate', 'en', TRUE), ('peakperformance', 'en', TRUE),
      ('pust', 'no', TRUE), ('pusteteknikk', 'no', TRUE), ('pustearbeid', 'no', TRUE),
      ('stressmestring', 'no', TRUE), ('søvnhack', 'no', TRUE), ('biohackingnorge', 'no', TRUE),
      ('mentalhelse', 'no', TRUE), ('roisjela', 'no', TRUE), ('velvære', 'no', TRUE),
      ('respiracion', 'es', TRUE), ('saludmental', 'es', TRUE), ('estres', 'es', TRUE),
      ('ansiedad', 'es', TRUE), ('recuperacion', 'es', TRUE),
      ('respiracao', 'pt', TRUE), ('meditacao', 'pt', TRUE), ('bemestar', 'pt', TRUE),
      ('biohacking', 'pt', TRUE), ('saudemental', 'pt', TRUE), ('estresse', 'pt', TRUE),
      ('ansiedade', 'pt', TRUE), ('recuperacao', 'pt', TRUE)
    ON CONFLICT (keyword) DO NOTHING;
    
    -- Admin Users for Mission Control
    -- Role can be 'owner' or 'freelancer'
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'freelancer',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Deep Memory for Scout Agent
    -- Stores distilled insights after analyzing approvals/rejections
    CREATE TABLE IF NOT EXISTS scout_memory (
      id SERIAL PRIMARY KEY,
      persona_insight TEXT NOT NULL,
      approved_count INTEGER DEFAULT 0,
      rejected_count INTEGER DEFAULT 0,
      suggested_hashtags TEXT, -- serialized array
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Blocklist for Scout Agent
    -- Handles or keywords to NEVER contact (competitors, authorities)
    CREATE TABLE IF NOT EXISTS scout_blocklist (
      id SERIAL PRIMARY KEY,
      target TEXT UNIQUE NOT NULL, -- handle or string
      type TEXT DEFAULT 'handle', -- 'handle' or 'keyword'
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Seed Blocklist with required Huberman and Wim Hof official handles
    INSERT INTO scout_blocklist (target, type, reason)
    VALUES 
      ('hubermanlab', 'handle', 'Authority/Official Account'),
      ('wimhof', 'handle', 'Authority/Official Account'),
      ('dr_andrew_huberman', 'handle', 'Authority/Official Account'),
      ('iceman_hof', 'handle', 'Authority/Official Account'),
      ('headspace', 'handle', 'Direct Competitor'),
      ('calm', 'handle', 'Direct Competitor'),
      ('coherence_breath', 'handle', 'Direct Competitor')
    ON CONFLICT (target) DO NOTHING;

    -- Update offer_codes to track assignments
    ALTER TABLE offer_codes ADD COLUMN IF NOT EXISTS assigned_to_handle TEXT;
    ALTER TABLE offer_codes ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

    -- Platform split: existing codes are iOS App Store; Google Play codes import as 'android'
    ALTER TABLE offer_codes ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'ios';
    UPDATE offer_codes SET platform = 'ios' WHERE platform IS NULL;

    -- Add unique constraint for Scout Agent storage
    DO $$ 
    BEGIN 
      -- Only run the self-join DELETE if duplicates actually exist (avoids full table scan on every deploy)
      IF EXISTS (SELECT 1 FROM contacts GROUP BY handle, platform HAVING COUNT(*) > 1) THEN
        DELETE FROM contacts a USING contacts b
        WHERE a.id < b.id
        AND a.handle = b.handle
        AND a.platform = b.platform;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_handle_platform_unique') THEN
        ALTER TABLE contacts ADD CONSTRAINT contacts_handle_platform_unique UNIQUE (handle, platform);
      END IF;
    END $$;
  `)
  const { migrate: runDailyValueMigration } = require('./migrate-runner')
  await runDailyValueMigration(pool)
  console.log('Migration complete')
  await pool.end()
}

migrate().catch(err => {
  console.error('[migrate] Migration failed:', err.message)
  console.error('[migrate] Server will start anyway; investigate ASAP.')
  process.exit(0)
})
