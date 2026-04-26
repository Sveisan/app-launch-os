const SQL = `
  -- Daily Value: comment digest tables
  CREATE TABLE IF NOT EXISTS scout_watchlist (
    id            SERIAL PRIMARY KEY,
    handle        TEXT NOT NULL,
    platform      TEXT NOT NULL CHECK (platform IN ('instagram','tiktok')),
    display_name  TEXT,
    notes         TEXT,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scout_watchlist_handle_platform_unique') THEN
      ALTER TABLE scout_watchlist ADD CONSTRAINT scout_watchlist_handle_platform_unique UNIQUE (handle, platform);
    END IF;
  END $$;

  CREATE TABLE IF NOT EXISTS monitored_posts (
    id                       SERIAL PRIMARY KEY,
    platform                 TEXT NOT NULL,
    post_id                  TEXT NOT NULL,
    account_handle           TEXT NOT NULL,
    source                   TEXT NOT NULL CHECK (source IN ('pipeline','watchlist')),
    source_ref_id            INTEGER,
    post_url                 TEXT NOT NULL,
    caption                  TEXT,
    thumbnail_url            TEXT,
    published_at             TIMESTAMPTZ,
    first_seen_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_comments_fetched_at TIMESTAMPTZ,
    archived_at              TIMESTAMPTZ
  );

  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monitored_posts_platform_post_unique') THEN
      ALTER TABLE monitored_posts ADD CONSTRAINT monitored_posts_platform_post_unique UNIQUE (platform, post_id);
    END IF;
  END $$;

  CREATE TABLE IF NOT EXISTS digest_items (
    id                    SERIAL PRIMARY KEY,
    monitored_post_id     INTEGER NOT NULL REFERENCES monitored_posts(id) ON DELETE CASCADE,
    platform              TEXT NOT NULL,
    comment_id            TEXT NOT NULL,
    commenter_handle      TEXT NOT NULL,
    comment_text          TEXT NOT NULL,
    comment_posted_at     TIMESTAMPTZ,
    relevance_strategy    TEXT NOT NULL,
    relevance_score       NUMERIC,
    reply_draft           TEXT,
    reply_draft_model     TEXT,
    status                TEXT NOT NULL DEFAULT 'new'
                          CHECK (status IN ('new','drafted','replied','skipped')),
    posted_via            TEXT,
    surfaced_in_digest_at TIMESTAMPTZ,
    status_changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'digest_items_platform_comment_unique') THEN
      ALTER TABLE digest_items ADD CONSTRAINT digest_items_platform_comment_unique UNIQUE (platform, comment_id);
    END IF;
  END $$;

  CREATE INDEX IF NOT EXISTS idx_digest_items_status ON digest_items (status);
  CREATE INDEX IF NOT EXISTS idx_digest_items_surfaced ON digest_items (surfaced_in_digest_at DESC);

  -- Reddit Prospector: subreddit watchlist + candidate triage
  CREATE TABLE IF NOT EXISTS reddit_subreddits (
    id                SERIAL PRIMARY KEY,
    name              TEXT NOT NULL UNIQUE,
    audience          TEXT NOT NULL CHECK (audience IN ('anti_gamification','pain_point','biohacker')),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    last_fetched_at   TIMESTAMPTZ,
    last_fetch_error  TEXT,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  INSERT INTO reddit_subreddits (name, audience) VALUES
    ('getdisciplined',      'anti_gamification'),
    ('Anxiety',             'pain_point'),
    ('PanicAttack',         'pain_point'),
    ('insomnia',            'pain_point'),
    ('sleep',               'pain_point'),
    ('decidingtobebetter',  'pain_point'),
    ('Biohackers',          'biohacker'),
    ('HubermanLab',         'biohacker'),
    ('Nootropics',          'biohacker'),
    ('breathwork',          'biohacker'),
    ('Wimhof',              'biohacker')
  ON CONFLICT (name) DO NOTHING;

  CREATE TABLE IF NOT EXISTS reddit_candidates (
    id                    SERIAL PRIMARY KEY,
    kind                  TEXT NOT NULL CHECK (kind IN ('post','comment')),
    platform              TEXT NOT NULL DEFAULT 'reddit',
    subreddit             TEXT NOT NULL,
    thread_id             TEXT NOT NULL,
    parent_id             TEXT,
    thread_url            TEXT NOT NULL,
    author_handle         TEXT,
    title                 TEXT,
    body                  TEXT,
    posted_at             TIMESTAMPTZ,
    score                 INTEGER,
    num_comments          INTEGER,
    audience              TEXT,
    draft_reply           TEXT,
    draft_contains_pitch  BOOLEAN NOT NULL DEFAULT FALSE,
    draft_model           TEXT,
    draft_generated_at    TIMESTAMPTZ,
    status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','replied','needs_edit','dismissed')),
    reply_posted_at       TIMESTAMPTZ,
    status_changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reddit_candidates_platform_thread_unique') THEN
      ALTER TABLE reddit_candidates ADD CONSTRAINT reddit_candidates_platform_thread_unique UNIQUE (platform, thread_id);
    END IF;
  END $$;

  CREATE INDEX IF NOT EXISTS idx_reddit_candidates_status ON reddit_candidates (status);
  CREATE INDEX IF NOT EXISTS idx_reddit_candidates_created ON reddit_candidates (created_at DESC);
`

async function migrate(pool) {
  await pool.query(SQL)
}

module.exports = { migrate, SQL }
