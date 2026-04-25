# Daily Value Comment Digest Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a nightly cron that scrapes IG+TikTok comments on pipeline creators + a manually-curated watch-list, filters question-style comments, drafts replies via Claude, sends a daily email, and renders a kanban-style "Daily Value" board above Influencer Pipeline in `/mission-control-x89` so the user can show up and add value in comment threads consistently.

**Architecture:** One nightly cron at 06:00 Europe/Oslo (`server/jobs/daily-value.js`) walks monitored accounts, discovers posts via Apify, dedupes new comments into `digest_items`, filters via a pluggable strategy module (`questions_v1` ships in v1, `ai_v1` slot reserved), drafts replies via Claude Haiku 4.5 in batched JSON calls, persists to Postgres, and emits both a Resend email + a kanban board. All schema changes are idempotent additions to `server/db/migrate.js`. Manual click-through posting in v1; `posted_via` column reserved for semi-auto Apify posting later.

**Tech Stack:** Node.js (CommonJS), Express 5, PostgreSQL via `pg` Pool, raw SQL, `apify-client` (already used) + raw `fetch` to Apify (the `server/platforms/index.js` pattern), `@anthropic-ai/sdk` with `claude-haiku-4-5-20251001`, `resend`, `node-cron`, Jest + Supertest.

**Reference design doc:** `docs/plans/2026-04-26-daily-value-comment-digest-design.md`. Read it once before starting; this plan is the executable form of that spec.

---

## Pre-flight

Before Task 1, confirm:

- Working directory is `/Users/eiriknerdal/conductor/workspaces/app-launch-os/gwangju`.
- Branch is `Sveisan/daily-comment-digest`.
- `git status` is clean.
- `npm install` has been run.
- Run `npm test` to confirm baseline is green: expect 2 suites pass (`tests/routes/creator.test.js`, `tests/routes/waitlist.test.js`).

---

## Conventions (every task follows these)

- **CommonJS only.** `require`/`module.exports`. No `import`/`export`.
- **Raw SQL via `pool.query(...)` from `require('../db/index')`.** No ORM, no query builder.
- **Migrations are append-only and idempotent.** `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING`. Never edit a prior migration statement destructively.
- **Tests mock at the module boundary.** Mock `../../server/db/index`, `../../server/email/index`, `../../server/platforms/index`, and `@anthropic-ai/sdk` — never make real network calls.
- **HTML templates use the `esc()` helper** (defined at `server/templates/admin.js:1`) on every interpolated value. Inline JS in HTML uses backticks; nested template literals must be escaped (`\${...}`) — see admin.js commit `4f30333` for prior bugs in this area.
- **Claude model:** `claude-haiku-4-5-20251001`. The existing scout.js uses an older `claude-3-5-sonnet-20240620` — do not copy that string; use Haiku 4.5 for the digest because it's a high-volume batch workload.
- **Commit after each task** — small commits, one task per commit, conventional-commit prefixes (`feat:`, `test:`, `chore:`, `docs:`).
- **Run `npm test` before each commit.** All tests must pass — never commit a red bar.
- **No emojis** in code, comments, or commit messages unless the surrounding code already has them.
- **No new dependencies** without explicit justification. Everything in this plan uses what's already in `package.json`.

---

## Task 1: Schema — `scout_watchlist`, `monitored_posts`, `digest_items`

**Files:**
- Modify: `server/db/migrate.js` — append a new block at the end of the SQL string (before the closing backtick on line 211).
- Create: `tests/db/migrate-daily-value.test.js`

**Step 1: Write the failing test**

Create `tests/db/migrate-daily-value.test.js`:

```js
const { Pool } = require('pg')

const TEST_DB = process.env.TEST_DATABASE_URL

const describeIfDb = TEST_DB ? describe : describe.skip

describeIfDb('daily-value migration', () => {
  let pool
  beforeAll(() => { pool = new Pool({ connectionString: TEST_DB }) })
  afterAll(async () => { await pool.end() })

  it('creates scout_watchlist, monitored_posts, digest_items idempotently', async () => {
    const { migrate } = require('../../server/db/migrate-runner')
    await migrate(pool)
    await migrate(pool) // second run must not throw

    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('scout_watchlist','monitored_posts','digest_items')
    `)
    expect(tables.rows.map(r => r.table_name).sort())
      .toEqual(['digest_items','monitored_posts','scout_watchlist'])
  })
})
```

**Step 2: Run the test to verify it fails**

Run: `npm test -- tests/db/migrate-daily-value.test.js`
Expected: SKIPPED if `TEST_DATABASE_URL` is unset (this is fine — the test self-skips). If `TEST_DATABASE_URL` is set, expect FAIL with "Cannot find module '../../server/db/migrate-runner'".

This skip-by-default pattern means CI without a Postgres instance still passes; a developer with a local Postgres can opt in by setting `TEST_DATABASE_URL`.

**Step 3: Refactor migrate.js to extract a runnable function**

Currently `server/db/migrate.js` calls `migrate()` at module load and ends the pool. We need a reusable `migrate(pool)` function so the test can call it.

Create `server/db/migrate-runner.js`:

```js
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
`

async function migrate(pool) {
  await pool.query(SQL)
}

module.exports = { migrate, SQL }
```

**Step 4: Wire migrate-runner into the existing migrate.js**

Edit `server/db/migrate.js`. Inside the existing `migrate()` function, after the closing backtick of the existing big SQL string and before `console.log('Migration complete')`, append:

```js
  const { SQL: dailyValueSQL } = require('./migrate-runner')
  await pool.query(dailyValueSQL)
```

Do NOT edit the existing SQL block. The new tables go in their own block via the runner module.

**Step 5: Run tests**

Run: `npm test`
Expected: all tests pass (the new migration test skips without `TEST_DATABASE_URL`; existing tests continue to pass).

If you have a local Postgres for testing, also run:
```bash
TEST_DATABASE_URL=postgres://localhost/postgres_test npm test -- tests/db/migrate-daily-value.test.js
```
Expected: test passes — both runs of `migrate()` succeed and the three tables exist.

**Step 6: Commit**

```bash
git add server/db/migrate.js server/db/migrate-runner.js tests/db/migrate-daily-value.test.js
git commit -m "feat: add daily-value schema (scout_watchlist, monitored_posts, digest_items)"
```

---

## Task 2: Relevance strategy — `questions_v1`

**Files:**
- Create: `server/jobs/strategies/questions-v1.js`
- Create: `server/jobs/strategies/index.js`
- Create: `tests/jobs/strategies/questions-v1.test.js`

**Step 1: Write the failing test**

Create `tests/jobs/strategies/questions-v1.test.js`:

```js
const { filter } = require('../../../server/jobs/strategies/questions-v1')

const c = (text, extras = {}) => ({
  comment_id: 'x', commenter_handle: 'u', comment_text: text,
  comment_posted_at: null, ...extras
})

describe('questions-v1 filter', () => {
  it('keeps comments ending with ?', () => {
    const out = filter([c('how do I do box breathing?')])
    expect(out).toHaveLength(1)
    expect(out[0].relevance_strategy).toBe('questions_v1')
    expect(out[0].relevance_score).toBeNull()
  })

  it('keeps English question-word leads', () => {
    expect(filter([c('What app do you use')]).length).toBe(1)
    expect(filter([c('Can this help with panic attacks')]).length).toBe(1)
  })

  it('keeps Spanish question forms', () => {
    expect(filter([c('¿Cómo respirar mejor?')]).length).toBe(1)
    expect(filter([c('qué hacer cuando no puedo dormir')]).length).toBe(1)
  })

  it('keeps Portuguese question forms', () => {
    expect(filter([c('como faço respiração de caixa?')]).length).toBe(1)
    expect(filter([c('o que voce recomenda')]).length).toBe(1)
  })

  it('rejects emoji-only', () => {
    expect(filter([c('🔥🔥🔥')])).toEqual([])
  })

  it('rejects affirmations and noise', () => {
    expect(filter([c('love this')])).toEqual([])
    expect(filter([c('first!')])).toEqual([])
    expect(filter([c('check my profile')])).toEqual([])
    expect(filter([c('amazing')])).toEqual([])
  })

  it('rejects empty/whitespace', () => {
    expect(filter([c('')])).toEqual([])
    expect(filter([c('   ')])).toEqual([])
  })

  it('returns the original comment fields plus strategy metadata', () => {
    const input = c('how does this work?', { comment_id: 'abc', commenter_handle: 'jane' })
    const [out] = filter([input])
    expect(out.comment_id).toBe('abc')
    expect(out.commenter_handle).toBe('jane')
    expect(out.comment_text).toBe('how does this work?')
    expect(out.relevance_strategy).toBe('questions_v1')
    expect(out.relevance_score).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/jobs/strategies/questions-v1.test.js`
Expected: FAIL with "Cannot find module '../../../server/jobs/strategies/questions-v1'".

**Step 3: Implement the strategy**

Create `server/jobs/strategies/questions-v1.js`:

```js
const NAME = 'questions_v1'

// English question-word leads (whole-word match at the start, after optional punctuation/quotes)
const EN_LEADS = /^[\s"'¿]*(how|what|why|when|where|which|who|can|could|should|would|do|does|did|is|are|was|were|will|am)\b/i

// Spanish question-word leads (with or without leading ¿)
const ES_LEADS = /^[\s"'¿]*(cómo|como|qué|que|por\s+qué|cuándo|cuando|dónde|donde|cuál|cual|quién|quien|puedo|puede|puedes|debería|deberia|hay)\b/i

// Portuguese question-word leads
const PT_LEADS = /^[\s"'¿]*(como|o\s+que|por\s+que|por\s+quê|quando|onde|qual|quem|posso|pode|deveria|tem)\b/i

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
```

**Step 4: Wire up the dispatcher**

Create `server/jobs/strategies/index.js`:

```js
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
```

**Step 5: Run tests**

Run: `npm test -- tests/jobs/strategies/questions-v1.test.js`
Expected: PASS — all 8 test cases green.

Then `npm test` to verify nothing else regressed.

**Step 6: Commit**

```bash
git add server/jobs/strategies tests/jobs/strategies
git commit -m "feat: add questions_v1 relevance strategy with EN/ES/PT support"
```

---

## Task 3: Platform integration — `getRecentPosts` and `getPostComments`

**Files:**
- Modify: `server/platforms/index.js`
- Create: `tests/platforms/daily-value.test.js`

**Step 1: Write the failing test**

Create `tests/platforms/daily-value.test.js`:

```js
const realFetch = global.fetch

beforeEach(() => {
  global.fetch = jest.fn()
})
afterAll(() => {
  global.fetch = realFetch
})

jest.mock('../../config/app', () => ({
  apify: { apiToken: 'TEST_TOKEN' },
  appName: 'Test', supportEmail: 't@t.com', fromEmail: 't@t.com',
  resend: { apiKey: 'k' }, eligibility: { followerThreshold: 500 },
  db: {},
}))

const platforms = require('../../server/platforms')

describe('getRecentPosts', () => {
  it('Instagram: maps actor response to normalized posts', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [{
        latestPosts: [
          { id: 'POST1', shortCode: 'aaa', caption: 'hi',
            displayUrl: 'https://i/img.jpg', timestamp: '2026-04-25T10:00:00Z' }
        ]
      }],
    })

    const posts = await platforms.getRecentPosts('instagram', 'creator', { sinceHours: 24 })
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({
      platform: 'instagram',
      post_id: 'POST1',
      post_url: 'https://www.instagram.com/p/aaa/',
      caption: 'hi',
      thumbnail_url: 'https://i/img.jpg',
    })
    expect(posts[0].published_at).toBeInstanceOf(Date)
  })

  it('Instagram: filters out posts older than sinceHours', async () => {
    const old = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
    const fresh = new Date(Date.now() - 1 * 3600 * 1000).toISOString()
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [{
        latestPosts: [
          { id: 'OLD', shortCode: 'old', caption: '', displayUrl: '', timestamp: old },
          { id: 'NEW', shortCode: 'new', caption: '', displayUrl: '', timestamp: fresh },
        ]
      }],
    })

    const posts = await platforms.getRecentPosts('instagram', 'creator', { sinceHours: 24 })
    expect(posts.map(p => p.post_id)).toEqual(['NEW'])
  })

  it('TikTok: maps actor response', async () => {
    const fresh = new Date(Date.now() - 1 * 3600 * 1000).toISOString()
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [{
        id: 'V1',
        webVideoUrl: 'https://www.tiktok.com/@u/video/V1',
        text: 'caption',
        videoMeta: { coverUrl: 'https://t/c.jpg' },
        createTimeISO: fresh,
      }],
    })

    const posts = await platforms.getRecentPosts('tiktok', 'u', { sinceHours: 24 })
    expect(posts).toHaveLength(1)
    expect(posts[0].post_id).toBe('V1')
    expect(posts[0].post_url).toBe('https://www.tiktok.com/@u/video/V1')
  })

  it('throws on unsupported platform', async () => {
    await expect(platforms.getRecentPosts('youtube', 'u'))
      .rejects.toThrow(/Unsupported platform/)
  })
})

describe('getPostComments', () => {
  it('Instagram: maps comment-scraper response', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'C1', ownerUsername: 'jane', text: 'how does this work?',
          timestamp: '2026-04-25T11:00:00Z' },
      ],
    })
    const comments = await platforms.getPostComments('instagram', 'POST1', {
      postUrl: 'https://www.instagram.com/p/aaa/',
    })
    expect(comments).toEqual([{
      platform: 'instagram',
      post_id: 'POST1',
      comment_id: 'C1',
      commenter_handle: 'jane',
      comment_text: 'how does this work?',
      comment_posted_at: expect.any(Date),
    }])
  })

  it('TikTok: maps comment-scraper response', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { cid: 'C1', uniqueId: 'jane', text: 'what does this mean?',
          createTimeISO: '2026-04-25T11:00:00Z' },
      ],
    })
    const comments = await platforms.getPostComments('tiktok', 'V1', {
      postUrl: 'https://www.tiktok.com/@u/video/V1',
    })
    expect(comments[0].comment_id).toBe('C1')
    expect(comments[0].commenter_handle).toBe('jane')
  })

  it('throws if Apify returns non-OK', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 503 })
    await expect(platforms.getPostComments('instagram', 'X', { postUrl: 'u' }))
      .rejects.toThrow(/Apify responded 503/)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/platforms/daily-value.test.js`
Expected: FAIL — `platforms.getRecentPosts is not a function`.

**Step 3: Add the implementations**

Edit `server/platforms/index.js`. Append below the existing `getFollowers` exports (after line 90, before the `module.exports`):

```js
async function getInstagramRecentPosts(handle, sinceHours) {
  const username = handle.replace(/^@/, '').toLowerCase()
  const data = await runActor('apify~instagram-profile-scraper', { usernames: [username] })
  if (!data || !data[0]) return []
  const latest = data[0].latestPosts || []
  const cutoff = Date.now() - sinceHours * 3600 * 1000
  return latest
    .map(p => ({
      platform: 'instagram',
      post_id: String(p.id || p.shortCode || ''),
      post_url: p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : (p.url || ''),
      caption: p.caption || '',
      thumbnail_url: p.displayUrl || p.thumbnailUrl || '',
      published_at: p.timestamp ? new Date(p.timestamp) : null,
    }))
    .filter(p => p.post_id && p.published_at && p.published_at.getTime() >= cutoff)
}

async function getTikTokRecentPosts(handle, sinceHours) {
  const username = handle.replace(/^@/, '').toLowerCase()
  const data = await runActor('clockworks~tiktok-scraper', {
    profiles: [`https://www.tiktok.com/@${username}`],
    resultsPerPage: 20,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  })
  if (!Array.isArray(data)) return []
  const cutoff = Date.now() - sinceHours * 3600 * 1000
  return data
    .map(v => ({
      platform: 'tiktok',
      post_id: String(v.id || ''),
      post_url: v.webVideoUrl || `https://www.tiktok.com/@${username}/video/${v.id}`,
      caption: v.text || v.desc || '',
      thumbnail_url: (v.videoMeta && v.videoMeta.coverUrl) || v.coverUrl || '',
      published_at: v.createTimeISO ? new Date(v.createTimeISO)
        : (v.createTime ? new Date(v.createTime * 1000) : null),
    }))
    .filter(p => p.post_id && p.published_at && p.published_at.getTime() >= cutoff)
}

async function getRecentPosts(platform, handle, { sinceHours = 24 } = {}) {
  switch (platform) {
    case 'instagram': return getInstagramRecentPosts(handle, sinceHours)
    case 'tiktok':    return getTikTokRecentPosts(handle, sinceHours)
    default: throw new Error(`Unsupported platform: ${platform}`)
  }
}

async function getInstagramPostComments(postUrl, limit) {
  const data = await runActor('apify~instagram-comment-scraper', {
    directUrls: [postUrl],
    resultsLimit: limit,
  })
  if (!Array.isArray(data)) return []
  return data.map(c => ({
    comment_id: String(c.id || ''),
    commenter_handle: c.ownerUsername || c.owner?.username || '',
    comment_text: c.text || '',
    comment_posted_at: c.timestamp ? new Date(c.timestamp) : null,
  })).filter(c => c.comment_id)
}

async function getTikTokPostComments(postUrl, limit) {
  const data = await runActor('clockworks~tiktok-comments-scraper', {
    postURLs: [postUrl],
    commentsPerPost: limit,
  })
  if (!Array.isArray(data)) return []
  return data.map(c => ({
    comment_id: String(c.cid || c.id || ''),
    commenter_handle: c.uniqueId || c.user?.uniqueId || '',
    comment_text: c.text || '',
    comment_posted_at: c.createTimeISO ? new Date(c.createTimeISO)
      : (c.createTime ? new Date(c.createTime * 1000) : null),
  })).filter(c => c.comment_id)
}

async function getPostComments(platform, postId, { postUrl, limit = 100 } = {}) {
  if (!postUrl) throw new Error('getPostComments requires postUrl')
  let raw
  switch (platform) {
    case 'instagram': raw = await getInstagramPostComments(postUrl, limit); break
    case 'tiktok':    raw = await getTikTokPostComments(postUrl, limit); break
    default: throw new Error(`Unsupported platform: ${platform}`)
  }
  return raw.map(c => ({
    platform,
    post_id: postId,
    ...c,
  }))
}
```

Update the `module.exports` to include the new functions:

```js
module.exports = { getFollowers, getRecentPosts, getPostComments }
```

**Step 4: Run tests**

Run: `npm test -- tests/platforms/daily-value.test.js`
Expected: PASS — all 7 cases green.

Then `npm test` — all suites green.

**Step 5: Commit**

```bash
git add server/platforms/index.js tests/platforms/daily-value.test.js
git commit -m "feat: add Apify getRecentPosts and getPostComments for IG/TikTok"
```

---

## Task 4: Config additions

**Files:**
- Modify: `config/app.js`

**Step 1: Read config/app.js**

Already read in Pre-flight. Existing config exports `appName`, `supportEmail`, `fromEmail`, `resend`, `apify`, `eligibility`, `db`.

**Step 2: Add new config keys**

Edit `config/app.js`. Inside the `module.exports`, add a `digest` block alongside the existing keys:

```js
  digest: {
    recipient: process.env.DIGEST_RECIPIENT || 'support@breathecollection.app',
    cron: process.env.DIGEST_CRON || '0 6 * * *',
    relevanceStrategy: process.env.DIGEST_RELEVANCE_STRATEGY || 'questions_v1',
    maxCommentsPerPost: parseInt(process.env.DIGEST_MAX_COMMENTS_PER_POST, 10) || 100,
    replyDraftModel: process.env.DIGEST_REPLY_MODEL || 'claude-haiku-4-5-20251001',
    digestUrlBase: process.env.DIGEST_URL_BASE || 'http://localhost:3000',
  },
```

`digestUrlBase` is the public origin for the one-shot email links — set in Railway to `https://<your-deployed-host>`.

**Step 3: Commit**

```bash
git add config/app.js
git commit -m "chore: add digest config block (cron, recipient, strategy, model)"
```

(No test for plain config — covered transitively by job tests below.)

---

## Task 5: One-shot status token (HMAC sign/verify)

**Files:**
- Create: `server/jobs/digest-token.js`
- Create: `tests/jobs/digest-token.test.js`

**Step 1: Write the failing test**

Create `tests/jobs/digest-token.test.js`:

```js
process.env.ADMIN_SECRET_KEY = 'test-secret'
const { sign, verify } = require('../../server/jobs/digest-token')

describe('digest-token', () => {
  it('round-trips item id + status', () => {
    const t = sign(42, 'replied')
    expect(verify(t)).toEqual({ id: 42, status: 'replied' })
  })

  it('rejects a tampered token', () => {
    const t = sign(42, 'replied')
    const tampered = t.slice(0, -2) + (t.slice(-2) === 'aa' ? 'bb' : 'aa')
    expect(verify(tampered)).toBeNull()
  })

  it('rejects garbage', () => {
    expect(verify('not-a-token')).toBeNull()
    expect(verify('')).toBeNull()
  })

  it('produces different tokens for different (id, status)', () => {
    expect(sign(1, 'replied')).not.toBe(sign(2, 'replied'))
    expect(sign(1, 'replied')).not.toBe(sign(1, 'skipped'))
  })
})
```

**Step 2: Run to verify it fails**

Run: `npm test -- tests/jobs/digest-token.test.js`
Expected: FAIL — module not found.

**Step 3: Implement**

Create `server/jobs/digest-token.js`:

```js
const crypto = require('crypto')

const SECRET = process.env.ADMIN_SECRET_KEY || 'breathe88'
const VALID_STATUSES = new Set(['replied', 'skipped'])

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromB64url(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4)
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

function sign(id, status) {
  const payload = `${id}.${status}`
  const mac = crypto.createHmac('sha256', SECRET).update(payload).digest()
  return `${payload}.${b64url(mac)}`
}

function verify(token) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [idStr, status, macB64] = parts
  if (!VALID_STATUSES.has(status)) return null
  const id = parseInt(idStr, 10)
  if (!Number.isInteger(id) || id <= 0) return null
  const expected = crypto.createHmac('sha256', SECRET).update(`${id}.${status}`).digest()
  let actual
  try { actual = fromB64url(macB64) } catch { return null }
  if (actual.length !== expected.length) return null
  if (!crypto.timingSafeEqual(actual, expected)) return null
  return { id, status }
}

module.exports = { sign, verify }
```

**Step 4: Run test**

Run: `npm test -- tests/jobs/digest-token.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/jobs/digest-token.js tests/jobs/digest-token.test.js
git commit -m "feat: add HMAC-signed one-shot tokens for digest email links"
```

---

## Task 6: Daily-value job — account resolution

**Files:**
- Create: `server/jobs/daily-value.js`
- Create: `tests/jobs/daily-value-accounts.test.js`

**Step 1: Write the failing test**

Create `tests/jobs/daily-value-accounts.test.js`:

```js
jest.mock('../../server/db/index', () => ({
  pool: { query: jest.fn() },
}))
const { pool } = require('../../server/db/index')
const { resolveMonitoredAccounts } = require('../../server/jobs/daily-value')

describe('resolveMonitoredAccounts', () => {
  beforeEach(() => { pool.query.mockReset() })

  it('unions pipeline + watchlist and dedups, pipeline winning', async () => {
    pool.query.mockResolvedValueOnce({ rows: [
      { handle: 'shared',   platform: 'instagram', source: 'pipeline',  source_ref_id: 1 },
      { handle: 'pipe-only', platform: 'tiktok',   source: 'pipeline',  source_ref_id: 2 },
    ]})
    pool.query.mockResolvedValueOnce({ rows: [
      { handle: 'shared',     platform: 'instagram', source: 'watchlist', source_ref_id: 99 },
      { handle: 'watch-only', platform: 'instagram', source: 'watchlist', source_ref_id: 7 },
    ]})

    const out = await resolveMonitoredAccounts()
    expect(out).toHaveLength(3)
    const shared = out.find(a => a.handle === 'shared')
    expect(shared.source).toBe('pipeline')
    expect(shared.source_ref_id).toBe(1)
  })

  it('only queries platforms instagram and tiktok in pipeline filter', async () => {
    pool.query.mockResolvedValue({ rows: [] })
    await resolveMonitoredAccounts()
    const sql = pool.query.mock.calls[0][0]
    expect(sql).toMatch(/pipeline_status\s+IN\s*\(\s*'discovery','researching','approved'\s*\)/)
    expect(sql).toMatch(/platform\s+IN\s*\(\s*'instagram','tiktok'\s*\)/)
  })
})
```

**Step 2: Run to verify it fails**

Run: `npm test -- tests/jobs/daily-value-accounts.test.js`
Expected: FAIL — `Cannot find module ... daily-value`.

**Step 3: Implement the function**

Create `server/jobs/daily-value.js` (this file will grow — start with just the account resolver):

```js
const { pool } = require('../db/index')

async function resolveMonitoredAccounts() {
  const pipelineRes = await pool.query(`
    SELECT handle, platform, 'pipeline' AS source, id AS source_ref_id
    FROM contacts
    WHERE pipeline_status IN ('discovery','researching','approved')
      AND platform IN ('instagram','tiktok')
      AND handle IS NOT NULL
  `)
  const watchRes = await pool.query(`
    SELECT handle, platform, 'watchlist' AS source, id AS source_ref_id
    FROM scout_watchlist
    WHERE is_active = TRUE
      AND platform IN ('instagram','tiktok')
  `)

  const map = new Map()
  for (const r of pipelineRes.rows) {
    map.set(`${r.platform}:${r.handle.toLowerCase()}`, r)
  }
  for (const r of watchRes.rows) {
    const key = `${r.platform}:${r.handle.toLowerCase()}`
    if (!map.has(key)) map.set(key, r)
  }
  return [...map.values()]
}

module.exports = { resolveMonitoredAccounts }
```

**Note on `contacts.platform` casing.** Existing scout.js writes platform as `'TikTok'` and `'Instagram'` (uppercase). The new feature uses lowercase consistently. The pipeline query above only matches lowercase rows. This is an intentional scoping choice — only treat new pipeline entries as monitored until we add a normalization migration. **Document this in the function's comment is unnecessary noise — leave the code self-explanatory; if this matters in practice we'll address it in a follow-up.**

Actually, this would silently exclude every existing pipeline contact. Better to normalize at query time:

Replace the `pipelineRes` query with:

```js
  const pipelineRes = await pool.query(`
    SELECT handle, LOWER(platform) AS platform, 'pipeline' AS source, id AS source_ref_id
    FROM contacts
    WHERE pipeline_status IN ('discovery','researching','approved')
      AND LOWER(platform) IN ('instagram','tiktok')
      AND handle IS NOT NULL
  `)
```

The test SQL match still passes because the regex matches `LOWER(platform) IN ('instagram','tiktok')` too — but tighten the regex if needed. Update the test regex to:

```js
    expect(sql).toMatch(/LOWER\(platform\)\s+IN\s*\(\s*'instagram','tiktok'\s*\)/)
```

**Step 4: Run test**

Run: `npm test -- tests/jobs/daily-value-accounts.test.js`
Expected: PASS — both cases green.

**Step 5: Commit**

```bash
git add server/jobs/daily-value.js tests/jobs/daily-value-accounts.test.js
git commit -m "feat: resolve monitored accounts (pipeline + watchlist union)"
```

---

## Task 7: Daily-value job — `discoverPosts` step

**Files:**
- Modify: `server/jobs/daily-value.js`
- Create: `tests/jobs/daily-value-discover.test.js`

**Step 1: Write the failing test**

Create `tests/jobs/daily-value-discover.test.js`:

```js
jest.mock('../../server/db/index', () => ({
  pool: { query: jest.fn() },
}))
jest.mock('../../server/platforms', () => ({
  getRecentPosts: jest.fn(),
  getPostComments: jest.fn(),
}))

const { pool } = require('../../server/db/index')
const platforms = require('../../server/platforms')
const { discoverPosts } = require('../../server/jobs/daily-value')

describe('discoverPosts', () => {
  beforeEach(() => {
    pool.query.mockReset()
    platforms.getRecentPosts.mockReset()
  })

  it('inserts each returned post idempotently per account', async () => {
    pool.query.mockResolvedValue({ rowCount: 1 })
    platforms.getRecentPosts.mockResolvedValueOnce([
      { platform: 'instagram', post_id: 'P1', post_url: 'u1', caption: 'c',
        thumbnail_url: 't', published_at: new Date('2026-04-25') },
    ])

    const accounts = [{ handle: 'a', platform: 'instagram', source: 'pipeline', source_ref_id: 1 }]
    const summary = await discoverPosts(accounts)

    expect(summary.accountsScanned).toBe(1)
    expect(summary.postsDiscovered).toBe(1)
    expect(summary.errors).toEqual([])
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO monitored_posts/i),
      expect.arrayContaining(['instagram', 'P1', 'a', 'pipeline', 1, 'u1', 'c', 't', expect.any(Date)])
    )
    expect(pool.query.mock.calls[0][0]).toMatch(/ON CONFLICT \(platform, post_id\) DO NOTHING/i)
  })

  it('continues on per-account failure', async () => {
    platforms.getRecentPosts
      .mockRejectedValueOnce(new Error('apify down'))
      .mockResolvedValueOnce([{
        platform: 'tiktok', post_id: 'V1', post_url: 'u', caption: '', thumbnail_url: '',
        published_at: new Date()
      }])
    pool.query.mockResolvedValue({ rowCount: 1 })

    const accounts = [
      { handle: 'a', platform: 'instagram', source: 'watchlist', source_ref_id: 1 },
      { handle: 'b', platform: 'tiktok',    source: 'watchlist', source_ref_id: 2 },
    ]
    const summary = await discoverPosts(accounts)

    expect(summary.accountsScanned).toBe(2)
    expect(summary.postsDiscovered).toBe(1)
    expect(summary.errors).toHaveLength(1)
    expect(summary.errors[0]).toMatch(/a.*apify down/i)
  })
})
```

**Step 2: Run to verify it fails**

Run: `npm test -- tests/jobs/daily-value-discover.test.js`
Expected: FAIL — `discoverPosts is not a function`.

**Step 3: Implement**

Edit `server/jobs/daily-value.js`. Add at the top of the file:

```js
const platforms = require('../platforms')
```

Add after `resolveMonitoredAccounts`:

```js
async function discoverPosts(accounts, { sinceHours = 24 } = {}) {
  const summary = { accountsScanned: 0, postsDiscovered: 0, errors: [] }
  for (const acct of accounts) {
    summary.accountsScanned++
    try {
      const posts = await platforms.getRecentPosts(acct.platform, acct.handle, { sinceHours })
      for (const p of posts) {
        const result = await pool.query(`
          INSERT INTO monitored_posts (
            platform, post_id, account_handle, source, source_ref_id,
            post_url, caption, thumbnail_url, published_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (platform, post_id) DO NOTHING
        `, [p.platform, p.post_id, acct.handle, acct.source, acct.source_ref_id,
            p.post_url, p.caption, p.thumbnail_url, p.published_at])
        if (result.rowCount > 0) summary.postsDiscovered++
      }
    } catch (err) {
      summary.errors.push(`@${acct.handle} (${acct.platform}): ${err.message}`)
    }
  }
  return summary
}

module.exports = { resolveMonitoredAccounts, discoverPosts }
```

**Step 4: Run test**

Run: `npm test -- tests/jobs/daily-value-discover.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/jobs/daily-value.js tests/jobs/daily-value-discover.test.js
git commit -m "feat: discoverPosts step inserts new posts via Apify per account"
```

---

## Task 8: Daily-value job — `fetchComments` step

**Files:**
- Modify: `server/jobs/daily-value.js`
- Create: `tests/jobs/daily-value-fetch.test.js`

**Step 1: Write the failing test**

Create `tests/jobs/daily-value-fetch.test.js`:

```js
jest.mock('../../server/db/index', () => ({
  pool: { query: jest.fn() },
}))
jest.mock('../../server/platforms', () => ({
  getRecentPosts: jest.fn(),
  getPostComments: jest.fn(),
}))

const { pool } = require('../../server/db/index')
const platforms = require('../../server/platforms')
const { fetchCommentsForActivePosts } = require('../../server/jobs/daily-value')

describe('fetchCommentsForActivePosts', () => {
  beforeEach(() => {
    pool.query.mockReset()
    platforms.getPostComments.mockReset()
  })

  it('queries posts inside 7-day window only', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] })
    await fetchCommentsForActivePosts({ maxCommentsPerPost: 100 })
    const sql = pool.query.mock.calls[0][0]
    expect(sql).toMatch(/archived_at IS NULL/i)
    expect(sql).toMatch(/published_at\s*>\s*NOW\(\)\s*-\s*INTERVAL\s*'7 days'/i)
    expect(sql).toMatch(/ORDER BY last_comments_fetched_at NULLS FIRST/i)
  })

  it('returns flattened comments and updates fetched_at', async () => {
    pool.query.mockResolvedValueOnce({ rows: [
      { id: 10, platform: 'instagram', post_id: 'P1', post_url: 'u1' },
      { id: 11, platform: 'tiktok',    post_id: 'V1', post_url: 'u2' },
    ]})
    platforms.getPostComments
      .mockResolvedValueOnce([
        { platform: 'instagram', post_id: 'P1', comment_id: 'c1',
          commenter_handle: 'j', comment_text: 'hi', comment_posted_at: null },
      ])
      .mockResolvedValueOnce([
        { platform: 'tiktok', post_id: 'V1', comment_id: 'c2',
          commenter_handle: 'k', comment_text: 'how?', comment_posted_at: null },
      ])
    pool.query.mockResolvedValue({ rowCount: 1 })

    const out = await fetchCommentsForActivePosts({ maxCommentsPerPost: 100 })
    expect(out.comments).toHaveLength(2)
    expect(out.comments[0]).toMatchObject({ comment_id: 'c1', monitored_post_id: 10 })
    expect(out.comments[1]).toMatchObject({ comment_id: 'c2', monitored_post_id: 11 })
    expect(out.summary.postsFetched).toBe(2)
    expect(out.summary.commentsFetched).toBe(2)
    expect(out.summary.errors).toEqual([])

    // last_comments_fetched_at update calls — at least one per successful post
    const updateCalls = pool.query.mock.calls.filter(
      c => /UPDATE monitored_posts SET last_comments_fetched_at/i.test(c[0])
    )
    expect(updateCalls).toHaveLength(2)
  })

  it('isolates per-post failure', async () => {
    pool.query.mockResolvedValueOnce({ rows: [
      { id: 10, platform: 'instagram', post_id: 'P1', post_url: 'u1' },
      { id: 11, platform: 'instagram', post_id: 'P2', post_url: 'u2' },
    ]})
    platforms.getPostComments
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce([{
        platform: 'instagram', post_id: 'P2', comment_id: 'c',
        commenter_handle: 'j', comment_text: 'hi', comment_posted_at: null
      }])
    pool.query.mockResolvedValue({ rowCount: 1 })

    const out = await fetchCommentsForActivePosts({ maxCommentsPerPost: 100 })
    expect(out.summary.errors).toHaveLength(1)
    expect(out.summary.commentsFetched).toBe(1)
  })
})
```

**Step 2: Run to verify it fails**

Run: `npm test -- tests/jobs/daily-value-fetch.test.js`
Expected: FAIL — function not exported.

**Step 3: Implement**

Edit `server/jobs/daily-value.js`. Append:

```js
async function fetchCommentsForActivePosts({ maxCommentsPerPost }) {
  const summary = { postsFetched: 0, commentsFetched: 0, errors: [] }
  const all = []

  const postsRes = await pool.query(`
    SELECT id, platform, post_id, post_url
    FROM monitored_posts
    WHERE archived_at IS NULL
      AND published_at > NOW() - INTERVAL '7 days'
    ORDER BY last_comments_fetched_at NULLS FIRST
  `)

  for (const post of postsRes.rows) {
    try {
      const comments = await platforms.getPostComments(post.platform, post.post_id, {
        postUrl: post.post_url,
        limit: maxCommentsPerPost,
      })
      summary.postsFetched++
      summary.commentsFetched += comments.length
      for (const c of comments) {
        all.push({ ...c, monitored_post_id: post.id })
      }
      await pool.query(
        `UPDATE monitored_posts SET last_comments_fetched_at = NOW() WHERE id = $1`,
        [post.id]
      )
    } catch (err) {
      summary.errors.push(`post ${post.platform}:${post.post_id}: ${err.message}`)
    }
  }

  return { comments: all, summary }
}

module.exports = { resolveMonitoredAccounts, discoverPosts, fetchCommentsForActivePosts }
```

**Step 4: Run test**

Run: `npm test -- tests/jobs/daily-value-fetch.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/jobs/daily-value.js tests/jobs/daily-value-fetch.test.js
git commit -m "feat: fetchCommentsForActivePosts walks 7-day window per post"
```

---

## Task 9: Daily-value job — Claude reply drafter (batched)

**Files:**
- Create: `server/jobs/digest-drafter.js`
- Create: `tests/jobs/digest-drafter.test.js`

**Step 1: Write the failing test**

Create `tests/jobs/digest-drafter.test.js`:

```js
jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn()
  return { Anthropic: jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } })) }
})

const { Anthropic } = require('@anthropic-ai/sdk')
const mockCreate = new Anthropic().messages.create
const { draftReplies } = require('../../server/jobs/digest-drafter')

beforeEach(() => { mockCreate.mockReset() })

describe('draftReplies', () => {
  it('returns input unchanged when empty', async () => {
    const out = await draftReplies([], { model: 'm' })
    expect(out).toEqual([])
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('attaches reply_draft and reply_draft_model to each comment', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify([
        { comment_id: 'c1', reply_draft: 'Try the 4-7-8 method.' },
        { comment_id: 'c2', reply_draft: 'Box breathing helps.' },
      ])}],
    })
    const input = [
      { comment_id: 'c1', commenter_handle: 'j', comment_text: 'how to relax?', _post_caption: 'sleep tips' },
      { comment_id: 'c2', commenter_handle: 'k', comment_text: 'best for focus?', _post_caption: 'focus tips' },
    ]
    const out = await draftReplies(input, { model: 'claude-haiku-4-5-20251001' })
    expect(out[0].reply_draft).toBe('Try the 4-7-8 method.')
    expect(out[0].reply_draft_model).toBe('claude-haiku-4-5-20251001')
    expect(out[1].reply_draft).toBe('Box breathing helps.')
  })

  it('batches in groups of 20', async () => {
    const input = Array.from({ length: 45 }, (_, i) => ({
      comment_id: `c${i}`, commenter_handle: 'u', comment_text: 'how?', _post_caption: '',
    }))
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(
        Array.from({ length: 20 }, (_, i) => ({ comment_id: `c${i}`, reply_draft: 'd' }))
      )}],
    })
    await draftReplies(input, { model: 'm' })
    // 45 / 20 = 3 batches
    expect(mockCreate).toHaveBeenCalledTimes(3)
  })

  it('falls back to empty draft when Claude returns malformed JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not json' }],
    })
    const input = [{ comment_id: 'c1', commenter_handle: 'j', comment_text: 'how?', _post_caption: '' }]
    const out = await draftReplies(input, { model: 'm' })
    expect(out[0].reply_draft).toBe('')
    expect(out[0].reply_draft_model).toBe('m')
  })

  it('survives Claude errors per batch', async () => {
    mockCreate.mockRejectedValueOnce(new Error('429'))
    const input = [{ comment_id: 'c1', commenter_handle: 'j', comment_text: 'how?', _post_caption: '' }]
    const out = await draftReplies(input, { model: 'm' })
    expect(out).toHaveLength(1)
    expect(out[0].reply_draft).toBe('')
  })
})
```

**Step 2: Run to verify it fails**

Run: `npm test -- tests/jobs/digest-drafter.test.js`
Expected: FAIL — module not found.

**Step 3: Implement**

Create `server/jobs/digest-drafter.js`:

```js
const { Anthropic } = require('@anthropic-ai/sdk')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const BATCH_SIZE = 20

const SYSTEM_PROMPT = `You are the Breathe Collection community voice — calm, evidence-led, generous.
Reply to each comment so the commenter feels heard and gets useful, specific value.
Constraints (hard):
- Under 280 characters per reply.
- No emojis unless the original comment used them.
- No links.
- Plain language. No marketing.
- End with a question or invitation only when natural.
Return ONLY JSON: an array of {"comment_id": string, "reply_draft": string}. No prose, no markdown.`

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function buildUserPrompt(batch) {
  return [
    'Draft replies for these comments. Each item shows the post context the commenter saw.',
    '',
    JSON.stringify(batch.map(c => ({
      comment_id: c.comment_id,
      post_caption: (c._post_caption || '').slice(0, 300),
      commenter_handle: c.commenter_handle,
      comment_text: c.comment_text,
    })), null, 2),
  ].join('\n')
}

function parseDrafts(text) {
  if (!text) return {}
  let str = text.trim()
  // If wrapped in code fences, strip them
  const fenceMatch = str.match(/```(?:json)?\s*([\s\S]+?)```/)
  if (fenceMatch) str = fenceMatch[1].trim()
  try {
    const arr = JSON.parse(str)
    if (!Array.isArray(arr)) return {}
    const out = {}
    for (const r of arr) {
      if (r && typeof r.comment_id === 'string') {
        out[r.comment_id] = String(r.reply_draft || '')
      }
    }
    return out
  } catch {
    return {}
  }
}

async function draftBatch(batch, model) {
  try {
    const resp = await anthropic.messages.create({
      model,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(batch) }],
    })
    const text = resp.content && resp.content[0] && resp.content[0].text
    return parseDrafts(text)
  } catch (err) {
    console.error('[digest-drafter] batch failed:', err.message)
    return {}
  }
}

async function draftReplies(comments, { model }) {
  if (!comments.length) return []
  const batches = chunk(comments, BATCH_SIZE)
  const drafts = {}
  for (const b of batches) {
    Object.assign(drafts, await draftBatch(b, model))
  }
  return comments.map(c => ({
    ...c,
    reply_draft: drafts[c.comment_id] || '',
    reply_draft_model: model,
  }))
}

module.exports = { draftReplies, BATCH_SIZE, SYSTEM_PROMPT }
```

**Step 4: Run test**

Run: `npm test -- tests/jobs/digest-drafter.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/jobs/digest-drafter.js tests/jobs/digest-drafter.test.js
git commit -m "feat: batch Claude reply drafter for digest items"
```

---

## Task 10: Daily-value job — `persistDigestItems`

**Files:**
- Modify: `server/jobs/daily-value.js`
- Create: `tests/jobs/daily-value-persist.test.js`

**Step 1: Write the failing test**

Create `tests/jobs/daily-value-persist.test.js`:

```js
jest.mock('../../server/db/index', () => ({
  pool: { query: jest.fn() },
}))
const { pool } = require('../../server/db/index')
const { persistDigestItems } = require('../../server/jobs/daily-value')

describe('persistDigestItems', () => {
  beforeEach(() => { pool.query.mockReset() })

  it('inserts each item idempotently and returns count of new rows', async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] })
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] })

    const items = [
      { monitored_post_id: 10, platform: 'instagram', comment_id: 'c1',
        commenter_handle: 'j', comment_text: 'how?', comment_posted_at: null,
        relevance_strategy: 'questions_v1', relevance_score: null,
        reply_draft: 'try this', reply_draft_model: 'm' },
      { monitored_post_id: 10, platform: 'instagram', comment_id: 'c2',
        commenter_handle: 'k', comment_text: 'what?', comment_posted_at: null,
        relevance_strategy: 'questions_v1', relevance_score: null,
        reply_draft: 'do that', reply_draft_model: 'm' },
    ]

    const out = await persistDigestItems(items)
    expect(out.itemsInserted).toBe(1)
    expect(out.itemsDuplicate).toBe(1)

    const sql = pool.query.mock.calls[0][0]
    expect(sql).toMatch(/INSERT INTO digest_items/i)
    expect(sql).toMatch(/ON CONFLICT \(platform, comment_id\) DO NOTHING/i)
    expect(sql).toMatch(/surfaced_in_digest_at = NOW\(\)/i)
  })
})
```

**Step 2: Run to verify it fails**

Run: `npm test -- tests/jobs/daily-value-persist.test.js`
Expected: FAIL — function not exported.

**Step 3: Implement**

Edit `server/jobs/daily-value.js`. Append:

```js
async function persistDigestItems(items) {
  const summary = { itemsInserted: 0, itemsDuplicate: 0 }
  for (const it of items) {
    const result = await pool.query(`
      INSERT INTO digest_items (
        monitored_post_id, platform, comment_id, commenter_handle, comment_text,
        comment_posted_at, relevance_strategy, relevance_score,
        reply_draft, reply_draft_model, status, surfaced_in_digest_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'new', NOW())
      ON CONFLICT (platform, comment_id) DO NOTHING
      RETURNING id
    `, [
      it.monitored_post_id, it.platform, it.comment_id, it.commenter_handle, it.comment_text,
      it.comment_posted_at, it.relevance_strategy, it.relevance_score,
      it.reply_draft, it.reply_draft_model,
    ])
    if (result.rowCount > 0) summary.itemsInserted++
    else summary.itemsDuplicate++
  }
  return summary
}

module.exports = { resolveMonitoredAccounts, discoverPosts, fetchCommentsForActivePosts, persistDigestItems }
```

**Step 4: Run test**

Run: `npm test -- tests/jobs/daily-value-persist.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/jobs/daily-value.js tests/jobs/daily-value-persist.test.js
git commit -m "feat: persistDigestItems with platform+comment_id idempotency"
```

---

## Task 11: Email renderer

**Files:**
- Create: `server/email/daily-value.js`
- Create: `tests/email/daily-value.test.js`

**Step 1: Write the failing test**

Create `tests/email/daily-value.test.js`:

```js
process.env.ADMIN_SECRET_KEY = 'test-secret'

jest.mock('../../config/app', () => ({
  appName: 'Breathe Collection',
  supportEmail: 't@t.com',
  fromEmail: 'from@t.com',
  resend: { apiKey: 'k' },
  apify: { apiToken: 't' },
  eligibility: { followerThreshold: 500 },
  db: {},
  digest: {
    recipient: 'r@t.com', cron: '0 6 * * *', relevanceStrategy: 'questions_v1',
    maxCommentsPerPost: 100, replyDraftModel: 'claude-haiku-4-5-20251001',
    digestUrlBase: 'https://example.com',
  },
}))

const { renderDigestEmail } = require('../../server/email/daily-value')

const item = (overrides = {}) => ({
  id: 1, monitored_post_id: 10, platform: 'instagram',
  commenter_handle: 'jane', comment_text: 'how?', comment_posted_at: new Date(),
  reply_draft: 'try this', post: { account_handle: 'creator',
    caption: 'a post', thumbnail_url: 'https://t/1.jpg', post_url: 'https://i/p/1' },
  ...overrides,
})

describe('renderDigestEmail', () => {
  it('returns null for empty items', () => {
    expect(renderDigestEmail({ items: [], runSummary: {} })).toBeNull()
  })

  it('renders subject with N count and date', () => {
    const out = renderDigestEmail({ items: [item()], runSummary: {} })
    expect(out.subject).toMatch(/Daily Value — 1 comment/)
  })

  it('renders multiple comments grouped by post', () => {
    const items = [
      item({ id: 1, comment_text: 'q1' }),
      item({ id: 2, comment_text: 'q2' }),
      item({ id: 3, monitored_post_id: 11, post: { account_handle: 'other',
        caption: 'b', thumbnail_url: '', post_url: 'https://i/p/2' }, comment_text: 'q3' }),
    ]
    const out = renderDigestEmail({ items, runSummary: { } })
    expect(out.html).toContain('@creator')
    expect(out.html).toContain('@other')
    expect(out.html).toContain('q1')
    expect(out.html).toContain('q2')
    expect(out.html).toContain('q3')
    expect(out.subject).toMatch(/3 comments/)
  })

  it('includes a Mark replied link with a verifiable token', () => {
    const { verify } = require('../../server/jobs/digest-token')
    const out = renderDigestEmail({ items: [item({ id: 42 })], runSummary: {} })
    const linkMatch = out.html.match(/href="(https:\/\/example\.com\/mission-control-x89\/daily-value\/items\/42\/status\?to=replied&token=([^"]+))"/)
    expect(linkMatch).toBeTruthy()
    const decoded = verify(linkMatch[2])
    expect(decoded).toEqual({ id: 42, status: 'replied' })
  })

  it('plain text contains all comments and links', () => {
    const out = renderDigestEmail({ items: [item({ comment_text: 'hello?' })], runSummary: {} })
    expect(out.text).toContain('@creator')
    expect(out.text).toContain('hello?')
    expect(out.text).toContain('https://i/p/1')
  })
})
```

**Step 2: Run to verify it fails**

Run: `npm test -- tests/email/daily-value.test.js`
Expected: FAIL — module not found.

**Step 3: Implement**

Create `server/email/daily-value.js`:

```js
const config = require('../../config/app')
const { sign } = require('../jobs/digest-token')

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function fmtDate(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d.getDate()} ${m[d.getMonth()]}`
}

function statusLink(itemId, to) {
  const token = sign(itemId, to)
  return `${config.digest.digestUrlBase}/mission-control-x89/daily-value/items/${itemId}/status?to=${to}&token=${token}`
}

function groupByPost(items) {
  const map = new Map()
  for (const it of items) {
    if (!map.has(it.monitored_post_id)) map.set(it.monitored_post_id, { post: it.post, items: [] })
    map.get(it.monitored_post_id).items.push(it)
  }
  return [...map.values()]
}

function renderHtml(groups) {
  const cards = groups.map(g => {
    const rows = g.items.map(it => `
      <div style="border-top:1px solid #eee;padding:12px 0;">
        <div style="font-size:13px;color:#666;margin-bottom:4px;">@${esc(it.commenter_handle)}</div>
        <div style="font-size:15px;color:#111;margin-bottom:8px;">${esc(it.comment_text)}</div>
        <div style="background:#f6f6f4;border-left:3px solid #52AB98;padding:8px 12px;font-size:14px;color:#333;margin-bottom:10px;">${esc(it.reply_draft)}</div>
        <div>
          <a href="${esc(it.post.post_url)}" style="display:inline-block;padding:6px 12px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:12px;margin-right:6px;">Open post</a>
          <a href="${esc(statusLink(it.id, 'replied'))}" style="display:inline-block;padding:6px 12px;background:#52AB98;color:#fff;text-decoration:none;border-radius:6px;font-size:12px;margin-right:6px;">Mark replied</a>
          <a href="${esc(statusLink(it.id, 'skipped'))}" style="display:inline-block;padding:6px 12px;background:#999;color:#fff;text-decoration:none;border-radius:6px;font-size:12px;">Skip</a>
        </div>
      </div>
    `).join('')
    const thumb = g.post.thumbnail_url
      ? `<img src="${esc(g.post.thumbnail_url)}" style="width:80px;height:80px;border-radius:8px;object-fit:cover;flex:0 0 80px;" />`
      : ''
    return `
      <div style="background:#fff;border:1px solid #eee;border-radius:12px;padding:20px;margin-bottom:20px;">
        <div style="display:flex;gap:12px;margin-bottom:12px;">
          ${thumb}
          <div>
            <div style="font-weight:600;font-size:16px;">@${esc(g.post.account_handle)}</div>
            <div style="font-size:13px;color:#666;margin-top:6px;">${esc((g.post.caption || '').slice(0, 200))}</div>
          </div>
        </div>
        ${rows}
      </div>
    `
  }).join('')
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;background:#fafaf8;padding:24px;">${cards}</div>`
}

function renderText(groups) {
  const lines = []
  for (const g of groups) {
    lines.push(`@${g.post.account_handle} — ${g.post.post_url}`)
    if (g.post.caption) lines.push(g.post.caption.slice(0, 200))
    for (const it of g.items) {
      lines.push('')
      lines.push(`  @${it.commenter_handle}: ${it.comment_text}`)
      if (it.reply_draft) lines.push(`  Draft: ${it.reply_draft}`)
      lines.push(`  Mark replied: ${statusLink(it.id, 'replied')}`)
    }
    lines.push('')
    lines.push('---')
  }
  return lines.join('\n')
}

function renderDigestEmail({ items, runSummary }) {
  if (!items || items.length === 0) return null
  const groups = groupByPost(items)
  const subject = `Daily Value — ${items.length} comment${items.length === 1 ? '' : 's'} worth showing up for (${fmtDate(new Date())})`
  return {
    subject,
    html: renderHtml(groups),
    text: renderText(groups),
  }
}

module.exports = { renderDigestEmail }
```

**Step 4: Run test**

Run: `npm test -- tests/email/daily-value.test.js`
Expected: PASS — all 5 cases green.

**Step 5: Commit**

```bash
git add server/email/daily-value.js tests/email/daily-value.test.js
git commit -m "feat: render digest email with token-signed Mark replied links"
```

---

## Task 12: Daily-value job — `runDailyValue` orchestrator

**Files:**
- Modify: `server/jobs/daily-value.js`
- Create: `tests/jobs/daily-value-run.test.js`

**Step 1: Write the failing test**

Create `tests/jobs/daily-value-run.test.js`:

```js
process.env.ADMIN_SECRET_KEY = 'test'
jest.mock('../../server/db/index', () => ({
  pool: { query: jest.fn() },
}))
jest.mock('../../server/platforms', () => ({
  getRecentPosts: jest.fn().mockResolvedValue([]),
  getPostComments: jest.fn().mockResolvedValue([]),
}))
jest.mock('../../server/jobs/digest-drafter', () => ({
  draftReplies: jest.fn(async (items) => items.map(c => ({ ...c, reply_draft: 'd', reply_draft_model: 'm' }))),
}))
jest.mock('../../server/email/index', () => ({
  sendNotification: jest.fn().mockResolvedValue(),
  sendEmail: jest.fn().mockResolvedValue(),
}))

const { pool } = require('../../server/db/index')
const platforms = require('../../server/platforms')
const email = require('../../server/email/index')
const { runDailyValue } = require('../../server/jobs/daily-value')

beforeEach(() => {
  pool.query.mockReset()
  platforms.getRecentPosts.mockClear()
  platforms.getPostComments.mockClear()
  email.sendEmail.mockClear()
  email.sendNotification.mockClear()
})

describe('runDailyValue', () => {
  it('skips email when no items surfaced', async () => {
    pool.query.mockImplementation((sql) => {
      if (/FROM contacts/i.test(sql)) return { rows: [] }
      if (/FROM scout_watchlist/i.test(sql)) return { rows: [] }
      if (/FROM monitored_posts/i.test(sql)) return { rows: [] }
      if (/INSERT INTO scout_logs/i.test(sql)) return { rows: [] }
      return { rows: [], rowCount: 0 }
    })
    const summary = await runDailyValue()
    expect(email.sendNotification).not.toHaveBeenCalled()
    expect(email.sendEmail).not.toHaveBeenCalled()
    expect(summary.itemsSurfaced).toBe(0)
  })

  it('sends email when items surface and writes a scout_logs row', async () => {
    const monitoredId = 99
    pool.query.mockImplementation((sql, params) => {
      if (/FROM contacts/i.test(sql)) {
        return { rows: [{ handle: 'a', platform: 'instagram', source: 'pipeline', source_ref_id: 1 }] }
      }
      if (/FROM scout_watchlist/i.test(sql)) return { rows: [] }
      if (/INSERT INTO monitored_posts/i.test(sql)) return { rowCount: 1 }
      if (/FROM monitored_posts/i.test(sql)) {
        return { rows: [{ id: monitoredId, platform: 'instagram', post_id: 'P1', post_url: 'u' }] }
      }
      if (/UPDATE monitored_posts/i.test(sql)) return { rowCount: 1 }
      if (/INSERT INTO digest_items/i.test(sql)) return { rowCount: 1, rows: [{ id: 1 }] }
      // Final post-fetch query for email rendering
      if (/SELECT.*FROM digest_items/i.test(sql)) {
        return { rows: [{
          id: 1, monitored_post_id: monitoredId, platform: 'instagram',
          commenter_handle: 'jane', comment_text: 'how?', comment_posted_at: new Date(),
          reply_draft: 'd', account_handle: 'a', caption: '', thumbnail_url: '', post_url: 'u',
        }]}
      }
      if (/INSERT INTO scout_logs/i.test(sql)) return { rows: [] }
      return { rows: [], rowCount: 0 }
    })

    platforms.getRecentPosts.mockResolvedValueOnce([{
      platform: 'instagram', post_id: 'P1', post_url: 'u', caption: '', thumbnail_url: '',
      published_at: new Date(),
    }])
    platforms.getPostComments.mockResolvedValueOnce([{
      platform: 'instagram', post_id: 'P1', comment_id: 'C1',
      commenter_handle: 'jane', comment_text: 'how?', comment_posted_at: new Date(),
    }])

    const summary = await runDailyValue()
    expect(email.sendNotification).toHaveBeenCalledTimes(1)
    expect(summary.itemsSurfaced).toBeGreaterThan(0)

    const logCall = pool.query.mock.calls.find(c => /INSERT INTO scout_logs/i.test(c[0]))
    expect(logCall).toBeTruthy()
    expect(logCall[1][0]).toMatch(/Daily Value/i)
  })
})
```

**Step 2: Run to verify it fails**

Run: `npm test -- tests/jobs/daily-value-run.test.js`
Expected: FAIL — `runDailyValue is not a function`.

**Step 3: Implement the orchestrator**

Edit `server/jobs/daily-value.js`. Add at the top:

```js
const config = require('../../config/app')
const { getStrategy } = require('./strategies')
const { draftReplies } = require('./digest-drafter')
const { renderDigestEmail } = require('../email/daily-value')
const { sendNotification } = require('../email/index')
```

Append:

```js
async function logRunSummary(summary) {
  const msg = `Daily Value: ${summary.accountsScanned} accounts, ${summary.postsDiscovered} posts, ${summary.commentsFetched} comments, ${summary.itemsSurfaced} items (dup ${summary.itemsDuplicate}), ${summary.errors.length} errors, ${summary.wallMs}ms`
  try { await pool.query('INSERT INTO scout_logs (message) VALUES ($1)', [msg]) }
  catch (err) { console.error('[daily-value] failed to log summary:', err.message) }
}

async function loadEmailItems(sinceTs) {
  const res = await pool.query(`
    SELECT d.id, d.monitored_post_id, d.platform, d.commenter_handle, d.comment_text,
           d.comment_posted_at, d.reply_draft,
           m.account_handle, m.caption, m.thumbnail_url, m.post_url
    FROM digest_items d
    JOIN monitored_posts m ON m.id = d.monitored_post_id
    WHERE d.surfaced_in_digest_at >= $1
    ORDER BY m.published_at DESC, d.comment_posted_at ASC
  `, [sinceTs])
  return res.rows.map(r => ({
    id: r.id, monitored_post_id: r.monitored_post_id, platform: r.platform,
    commenter_handle: r.commenter_handle, comment_text: r.comment_text,
    comment_posted_at: r.comment_posted_at, reply_draft: r.reply_draft,
    post: {
      account_handle: r.account_handle, caption: r.caption,
      thumbnail_url: r.thumbnail_url, post_url: r.post_url,
    },
  }))
}

async function runDailyValue() {
  const startTs = new Date()
  const startMs = Date.now()
  const strategy = getStrategy(config.digest.relevanceStrategy)

  const accounts = await resolveMonitoredAccounts()
  const discover = await discoverPosts(accounts)
  const fetchOut = await fetchCommentsForActivePosts({ maxCommentsPerPost: config.digest.maxCommentsPerPost })

  // Attach post caption to each comment so the drafter has context
  const postCaptions = new Map()
  if (fetchOut.comments.length) {
    const ids = [...new Set(fetchOut.comments.map(c => c.monitored_post_id))]
    const capRes = await pool.query(
      `SELECT id, caption FROM monitored_posts WHERE id = ANY($1::int[])`,
      [ids]
    )
    for (const r of capRes.rows) postCaptions.set(r.id, r.caption || '')
  }
  const enriched = fetchOut.comments.map(c => ({ ...c, _post_caption: postCaptions.get(c.monitored_post_id) || '' }))

  const filtered = strategy.filter(enriched)
  const drafted = await draftReplies(filtered, { model: config.digest.replyDraftModel })
  const persistOut = await persistDigestItems(drafted)

  const items = await loadEmailItems(startTs)
  const summary = {
    accountsScanned: discover.accountsScanned,
    postsDiscovered: discover.postsDiscovered,
    postsFetched: fetchOut.summary.postsFetched,
    commentsFetched: fetchOut.summary.commentsFetched,
    itemsFiltered: filtered.length,
    itemsSurfaced: persistOut.itemsInserted,
    itemsDuplicate: persistOut.itemsDuplicate,
    errors: [...discover.errors, ...fetchOut.summary.errors],
    wallMs: Date.now() - startMs,
  }

  const email = renderDigestEmail({ items, runSummary: summary })
  if (email) {
    try { await sendNotification(email) }
    catch (err) { summary.errors.push(`email send: ${err.message}`) }
  }

  await logRunSummary(summary)
  return summary
}

module.exports = {
  resolveMonitoredAccounts, discoverPosts, fetchCommentsForActivePosts,
  persistDigestItems, runDailyValue,
}
```

**Step 4: Run test**

Run: `npm test -- tests/jobs/daily-value-run.test.js`
Expected: PASS — both cases green.

Then `npm test` — full suite green.

**Step 5: Commit**

```bash
git add server/jobs/daily-value.js tests/jobs/daily-value-run.test.js
git commit -m "feat: runDailyValue orchestrates discover→fetch→filter→draft→persist→email"
```

---

## Task 13: Wire cron + skip in test mode

**Files:**
- Modify: `server/jobs/scheduler.js`

**Step 1: Read current scheduler**

(Already read in pre-flight. It has two cron entries: weekly content, hourly scout.)

**Step 2: Add the daily-value cron**

Edit `server/jobs/scheduler.js`. After the existing `cron.schedule('0 * * * *', ...)` block (line 27–34) and before the final `console.log(...)`:

```js
const config = require('../../config/app')
const { runDailyValue } = require('./daily-value')

cron.schedule(config.digest.cron, async () => {
  console.log('Daily Value: nightly run starting...')
  try { await runDailyValue() }
  catch (err) { console.error('Daily Value job error:', err) }
})
```

Move the `const config = require(...)` and `const { runDailyValue } = require(...)` lines to the top of the file with the other imports for cleanliness.

**Step 3: Verify NODE_ENV=test still skips**

`server/index.js:31-33` already gates `require('./jobs/scheduler')` on `NODE_ENV !== 'test'`. No change needed; the new cron entry inherits that gate.

**Step 4: Run tests**

Run: `npm test`
Expected: all tests pass (no timer leak, scheduler not loaded in test env).

**Step 5: Commit**

```bash
git add server/jobs/scheduler.js
git commit -m "feat: register Daily Value nightly cron"
```

---

## Task 14: `scripts/digest-now.js` and `scripts/digest-dry-run.js`

**Files:**
- Create: `scripts/digest-now.js`
- Create: `scripts/digest-dry-run.js`

**Step 1: Implement `digest-now.js`**

Create `scripts/digest-now.js`:

```js
const { runDailyValue } = require('../server/jobs/daily-value')
const { pool } = require('../server/db/index')

async function main() {
  console.log('Daily Value: manual trigger...')
  try {
    const summary = await runDailyValue()
    console.log('Run summary:', JSON.stringify(summary, null, 2))
  } catch (err) {
    console.error('Daily Value failed:', err)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
```

**Step 2: Implement `digest-dry-run.js`**

Create `scripts/digest-dry-run.js`:

```js
const { resolveMonitoredAccounts, discoverPosts, fetchCommentsForActivePosts } = require('../server/jobs/daily-value')
const { getStrategy } = require('../server/jobs/strategies')
const { draftReplies } = require('../server/jobs/digest-drafter')
const config = require('../config/app')
const { pool } = require('../server/db/index')

async function main() {
  console.log('Daily Value: DRY RUN (no DB writes to digest_items, no email)\n')
  try {
    const accounts = await resolveMonitoredAccounts()
    console.log(`Accounts: ${accounts.length}`)
    accounts.forEach(a => console.log(`  ${a.source}  @${a.handle}  ${a.platform}`))

    const discover = await discoverPosts(accounts)
    console.log(`\nPosts discovered: ${discover.postsDiscovered} (errors: ${discover.errors.length})`)
    discover.errors.forEach(e => console.log(`  ! ${e}`))

    const fetchOut = await fetchCommentsForActivePosts({ maxCommentsPerPost: config.digest.maxCommentsPerPost })
    console.log(`\nComments fetched: ${fetchOut.summary.commentsFetched} across ${fetchOut.summary.postsFetched} posts`)

    const strategy = getStrategy(config.digest.relevanceStrategy)
    const filtered = strategy.filter(fetchOut.comments)
    console.log(`\nFiltered (${strategy.name}): ${filtered.length} comments`)

    const drafted = await draftReplies(filtered.slice(0, 5), { model: config.digest.replyDraftModel })
    console.log(`\nDrafts (first 5):`)
    drafted.forEach(d => {
      console.log(`  @${d.commenter_handle}: "${d.comment_text}"`)
      console.log(`    -> ${d.reply_draft}`)
    })
  } catch (err) {
    console.error('Dry run failed:', err)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
```

**Step 3: Commit**

```bash
git add scripts/digest-now.js scripts/digest-dry-run.js
git commit -m "feat: add scripts/digest-now and digest-dry-run for manual triggers"
```

---

## Task 15: `scripts/import-watchlist.js`

**Files:**
- Create: `scripts/import-watchlist.js`

**Step 1: Implement**

Create `scripts/import-watchlist.js`:

```js
const fs = require('fs')
const path = require('path')
const { pool } = require('../server/db/index')

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: node scripts/import-watchlist.js <path-to-csv>')
    console.error('CSV format per line: handle,platform[,display_name[,notes]]')
    process.exit(1)
  }
  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`)
    process.exit(1)
  }
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/)
  let added = 0, updated = 0, skipped = 0

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(',').map(s => s.trim())
    const handle = (parts[0] || '').replace(/^@/, '')
    const platform = (parts[1] || '').toLowerCase()
    const display = parts[2] || null
    const notes = parts[3] || null

    if (!handle || !['instagram', 'tiktok'].includes(platform)) {
      console.warn(`  skip: "${line}" (need handle + platform=instagram|tiktok)`)
      skipped++
      continue
    }

    const result = await pool.query(`
      INSERT INTO scout_watchlist (handle, platform, display_name, notes, is_active)
      VALUES ($1, $2, $3, $4, TRUE)
      ON CONFLICT (handle, platform) DO UPDATE
      SET display_name = COALESCE(EXCLUDED.display_name, scout_watchlist.display_name),
          notes        = COALESCE(EXCLUDED.notes,        scout_watchlist.notes),
          is_active    = TRUE
      RETURNING xmax = 0 AS inserted
    `, [handle, platform, display, notes])

    if (result.rows[0].inserted) added++
    else updated++
  }

  console.log(`\nDone. added=${added} updated=${updated} skipped=${skipped}`)
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
```

The `xmax = 0` trick is the standard Postgres way to detect insert-vs-update from `ON CONFLICT … DO UPDATE`.

**Step 2: Commit**

```bash
git add scripts/import-watchlist.js
git commit -m "feat: bulk import watchlist from CSV"
```

---

## Task 16: Daily Value routes — list, patch, run, token-flip

**Files:**
- Create: `server/routes/daily-value.js`
- Modify: `server/routes/admin.js` (mount the sub-router)
- Create: `tests/routes/daily-value.test.js`

**Step 1: Write the failing test**

Create `tests/routes/daily-value.test.js`:

```js
process.env.ADMIN_SECRET_KEY = 'test'
const request = require('supertest')
const express = require('express')
const cookieParser = require('cookie-parser')

jest.mock('../../server/db/index', () => ({
  pool: { query: jest.fn() },
}))
jest.mock('../../server/jobs/daily-value', () => ({
  runDailyValue: jest.fn().mockResolvedValue({ itemsSurfaced: 3 }),
}))

const { pool } = require('../../server/db/index')
const { generateToken } = require('../../server/db/auth')
const { sign } = require('../../server/jobs/digest-token')
const dvRouter = require('../../server/routes/daily-value')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/mission-control-x89/daily-value', dvRouter)
  return app
}

const ownerToken = () => generateToken({ id: 1, email: 'o@t.com', role: 'owner' })
const freelancerToken = () => generateToken({ id: 2, email: 'f@t.com', role: 'freelancer' })

beforeEach(() => { pool.query.mockReset() })

describe('GET /items', () => {
  it('rejects unauthenticated requests', async () => {
    const app = buildApp()
    const res = await request(app).get('/mission-control-x89/daily-value/items')
    expect(res.status).toBe(404)
  })

  it('returns grouped items by status for an authenticated user', async () => {
    pool.query.mockResolvedValue({ rows: [
      { id: 1, status: 'new',     monitored_post_id: 10, platform: 'instagram',
        commenter_handle: 'a', comment_text: 'q', reply_draft: 'd',
        account_handle: 'x', caption: '', thumbnail_url: '', post_url: 'u',
        comment_posted_at: null, status_changed_at: new Date() },
      { id: 2, status: 'drafted', monitored_post_id: 10, platform: 'instagram',
        commenter_handle: 'b', comment_text: 'q2', reply_draft: 'd2',
        account_handle: 'x', caption: '', thumbnail_url: '', post_url: 'u',
        comment_posted_at: null, status_changed_at: new Date() },
    ]})
    const app = buildApp()
    const res = await request(app)
      .get('/mission-control-x89/daily-value/items')
      .set('Cookie', [`admin_jwt=${freelancerToken()}`])
    expect(res.status).toBe(200)
    expect(res.body.byStatus.new).toHaveLength(1)
    expect(res.body.byStatus.drafted).toHaveLength(1)
    expect(res.body.byStatus.replied).toEqual([])
    expect(res.body.byStatus.skipped).toEqual([])
  })
})

describe('PATCH /items/:id', () => {
  it('updates status and reply_draft, freelancer allowed', async () => {
    pool.query.mockResolvedValue({ rowCount: 1 })
    const app = buildApp()
    const res = await request(app)
      .patch('/mission-control-x89/daily-value/items/42')
      .set('Cookie', [`admin_jwt=${freelancerToken()}`])
      .send({ status: 'drafted', reply_draft: 'updated' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const sql = pool.query.mock.calls[0][0]
    expect(sql).toMatch(/UPDATE digest_items/i)
    expect(sql).toMatch(/status_changed_at = NOW\(\)/i)
  })

  it('rejects invalid status', async () => {
    const app = buildApp()
    const res = await request(app)
      .patch('/mission-control-x89/daily-value/items/42')
      .set('Cookie', [`admin_jwt=${freelancerToken()}`])
      .send({ status: 'evil' })
    expect(res.status).toBe(400)
  })
})

describe('POST /run', () => {
  it('owner-only', async () => {
    const app = buildApp()
    const denied = await request(app)
      .post('/mission-control-x89/daily-value/run')
      .set('Cookie', [`admin_jwt=${freelancerToken()}`])
    expect(denied.status).toBe(403)

    const ok = await request(app)
      .post('/mission-control-x89/daily-value/run')
      .set('Cookie', [`admin_jwt=${ownerToken()}`])
    expect(ok.status).toBe(200)
    expect(ok.body.success).toBe(true)
  })
})

describe('GET /items/:id/status (token flip)', () => {
  it('flips status when token is valid; idempotent on re-hit', async () => {
    pool.query.mockResolvedValue({ rowCount: 1 })
    const token = sign(99, 'replied')
    const app = buildApp()

    const res = await request(app)
      .get(`/mission-control-x89/daily-value/items/99/status?to=replied&token=${token}`)
    expect(res.status).toBe(200)
    expect(res.text).toMatch(/marked as replied/i)
    const sql = pool.query.mock.calls[0][0]
    expect(sql).toMatch(/UPDATE digest_items SET status = \$1/i)
  })

  it('rejects mismatched token', async () => {
    const goodToken = sign(99, 'replied')
    const app = buildApp()
    const res = await request(app)
      .get(`/mission-control-x89/daily-value/items/100/status?to=replied&token=${goodToken}`)
    expect(res.status).toBe(403)
  })

  it('rejects unknown status', async () => {
    const app = buildApp()
    const res = await request(app)
      .get(`/mission-control-x89/daily-value/items/99/status?to=hacked&token=anything`)
    expect(res.status).toBe(400)
  })
})
```

**Step 2: Run to verify it fails**

Run: `npm test -- tests/routes/daily-value.test.js`
Expected: FAIL — `Cannot find module '../../server/routes/daily-value'`.

**Step 3: Implement the router**

Create `server/routes/daily-value.js`:

```js
const express = require('express')
const router = express.Router()
const { pool } = require('../db/index')
const { checkAuth, ownerOnly } = require('../middleware/auth')
const { runDailyValue } = require('../jobs/daily-value')
const { verify } = require('../jobs/digest-token')

const VALID_STATUSES = ['new', 'drafted', 'replied', 'skipped']
const TOKEN_FLIP_STATUSES = new Set(['replied', 'skipped'])

router.get('/items', checkAuth, async (req, res) => {
  try {
    const days = Math.max(1, Math.min(30, parseInt(req.query.days, 10) || 7))
    const result = await pool.query(`
      SELECT d.id, d.status, d.monitored_post_id, d.platform,
             d.commenter_handle, d.comment_text, d.comment_posted_at,
             d.reply_draft, d.status_changed_at,
             m.account_handle, m.caption, m.thumbnail_url, m.post_url
      FROM digest_items d
      JOIN monitored_posts m ON m.id = d.monitored_post_id
      WHERE d.created_at > NOW() - ($1 || ' days')::INTERVAL
      ORDER BY d.status_changed_at DESC
    `, [String(days)])

    const byStatus = { new: [], drafted: [], replied: [], skipped: [] }
    for (const row of result.rows) {
      const item = {
        id: row.id, status: row.status, platform: row.platform,
        commenter_handle: row.commenter_handle, comment_text: row.comment_text,
        comment_posted_at: row.comment_posted_at, reply_draft: row.reply_draft,
        post: {
          account_handle: row.account_handle, caption: row.caption,
          thumbnail_url: row.thumbnail_url, post_url: row.post_url,
        },
      }
      if (byStatus[row.status]) byStatus[row.status].push(item)
    }
    res.json({ success: true, byStatus })
  } catch (err) {
    console.error('GET /daily-value/items error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

router.patch('/items/:id', checkAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'invalid id' })

    const { status, reply_draft } = req.body || {}
    const updates = []
    const params = []
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, error: 'invalid status' })
      }
      params.push(status)
      updates.push(`status = $${params.length}`)
    }
    if (reply_draft !== undefined) {
      params.push(String(reply_draft))
      updates.push(`reply_draft = $${params.length}`)
    }
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'nothing to update' })
    }
    updates.push('status_changed_at = NOW()')
    params.push(id)

    const result = await pool.query(
      `UPDATE digest_items SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params
    )
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'not found' })
    res.json({ success: true })
  } catch (err) {
    console.error('PATCH /daily-value/items/:id error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/run', checkAuth, ownerOnly, async (req, res) => {
  res.json({ success: true, message: 'Daily Value run started — check back in ~60s.' })
  runDailyValue().catch(err => console.error('Manual Daily Value run failed:', err))
})

router.get('/items/:id/status', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const { to, token } = req.query
    if (!TOKEN_FLIP_STATUSES.has(to)) {
      return res.status(400).send('Invalid status')
    }
    const decoded = verify(token)
    if (!decoded || decoded.id !== id || decoded.status !== to) {
      return res.status(403).send('Invalid or expired link')
    }
    await pool.query(
      `UPDATE digest_items SET status = $1, status_changed_at = NOW() WHERE id = $2`,
      [to, id]
    )
    res.status(200).send(`<html><body style="font-family:sans-serif;padding:2rem;">
      Item ${id} marked as <strong>${to}</strong>. You can close this tab.
    </body></html>`)
  } catch (err) {
    console.error('GET /daily-value/items/:id/status error:', err)
    res.status(500).send('Server error')
  }
})

module.exports = router
```

**Step 4: Mount the sub-router under /mission-control-x89**

Edit `server/routes/admin.js`. After the existing `const { ... } = require('../middleware/auth')` line (line 7), add:

```js
const dailyValueRouter = require('./daily-value')
```

Just before `module.exports = router` (line 399), add:

```js
router.use('/daily-value', dailyValueRouter)
```

**Step 5: Run tests**

Run: `npm test -- tests/routes/daily-value.test.js`
Expected: PASS — all 7 cases green.

Then `npm test` — full suite green.

**Step 6: Commit**

```bash
git add server/routes/daily-value.js server/routes/admin.js tests/routes/daily-value.test.js
git commit -m "feat: Daily Value routes (list, patch, run, token-flip)"
```

---

## Task 17: Admin dashboard — embed initial Daily Value payload + render board

**Files:**
- Modify: `server/routes/admin.js` (the dashboard handler at line 143)
- Modify: `server/templates/admin.js` (insert section above line 237)

**Step 1: Add initial payload to dashboard query**

Edit `server/routes/admin.js`. In the `router.get('/', checkAuth, async (req, res) => { ... })` handler (starts line 143):

After the `logsRes` query (line 217–222) and before the `const stats = { ... }` block, add:

```js
        // Daily Value: initial payload for the new board section
        const dvRes = await pool.query(`
          SELECT d.id, d.status, d.monitored_post_id, d.platform,
                 d.commenter_handle, d.comment_text, d.comment_posted_at,
                 d.reply_draft, d.status_changed_at,
                 m.account_handle, m.caption, m.thumbnail_url, m.post_url
          FROM digest_items d
          JOIN monitored_posts m ON m.id = d.monitored_post_id
          WHERE d.created_at > NOW() - INTERVAL '7 days'
          ORDER BY d.status_changed_at DESC
        `)
        const dailyValueByStatus = { new: [], drafted: [], replied: [], skipped: [] }
        for (const row of dvRes.rows) {
          const it = {
            id: row.id, status: row.status, platform: row.platform,
            commenter_handle: row.commenter_handle, comment_text: row.comment_text,
            comment_posted_at: row.comment_posted_at, reply_draft: row.reply_draft,
            post: {
              account_handle: row.account_handle, caption: row.caption,
              thumbnail_url: row.thumbnail_url, post_url: row.post_url,
            },
          }
          if (dailyValueByStatus[row.status]) dailyValueByStatus[row.status].push(it)
        }
```

In the `stats = { ... }` block, add `dailyValueByStatus` as a key.

**Step 2: Render the Daily Value section in the template**

Edit `server/templates/admin.js`. Find line 237 (`<h2 class="section-title">Influencer Pipeline</h2>`) and insert above it:

```html
        <h2 class="section-title">Daily Value</h2>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: -1rem; margin-bottom: 2rem;">Comment threads worth showing up in. Refreshed nightly at 06:00.</p>

        ${isOwner ? `
        <div class="modal-status-bar" style="margin-bottom: 2rem; display: flex; align-items: center; justify-content: space-between; background: rgba(82, 171, 152, 0.05); border: 1px dashed rgba(82, 171, 152, 0.3); padding: 1.5rem; border-radius: 16px;">
            <div>
                <h3 style="font-weight: 400; font-size: 1rem; margin-bottom: 0.2rem;">Manual Refresh</h3>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0;">Trigger the digest now instead of waiting for the cron.</p>
            </div>
            <div style="display: flex; gap: 10px;">
                <button id="dvRunNow" class="nav-btn" style="padding: 0.6rem 1.5rem;">Run Now</button>
            </div>
        </div>
        ` : ''}

        <div class="kanban-board" style="display: flex; gap: 1.5rem; overflow-x: auto; padding-bottom: 2rem;">
            ${['new','drafted','replied','skipped'].map(status => {
                const title = { new: 'New', drafted: 'Drafted', replied: 'Replied', skipped: 'Skipped' }[status];
                const items = (stats.dailyValueByStatus && stats.dailyValueByStatus[status]) || [];
                return `
                <div class="kanban-column" data-board="daily-value" data-status="${status}" id="dv-col-${status}" style="flex: 0 0 320px; min-height: 40vh; background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 16px; padding: 1.5rem; display: flex; flex-direction: column; max-height: 70vh;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <h4 style="font-weight: 500; font-size: 1rem;">${title}</h4>
                        <span style="background: rgba(255,255,255,0.1); padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem;">${items.length}</span>
                    </div>
                    <div class="dv-cards" id="dv-cards-${status}" style="overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 1rem; padding-right: 0.5rem;">
                        ${items.length === 0 ? `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 2rem 0;">Empty</div>` : items.map(it => renderDailyValueCard(it)).join('')}
                    </div>
                </div>
                `;
            }).join('')}
        </div>
```

**Step 3: Add the `renderDailyValueCard` helper at the top of the template module**

Edit `server/templates/admin.js`. After the `esc` helper (line 1), add:

```js
function timeAgo(d) {
    if (!d) return ''
    const diff = Date.now() - new Date(d).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const days = Math.floor(h / 24)
    return `${days}d ago`
}

function renderDailyValueCard(it) {
    const statusButtons = ['new','drafted','replied','skipped']
        .filter(s => s !== it.status)
        .map(s => `<button onclick="dvSetStatus(${it.id}, '${s}', this)" style="background:none;border:1px solid var(--card-border);color:var(--text-muted);padding:0.3rem 0.6rem;border-radius:6px;font-size:0.7rem;cursor:pointer;">→ ${s}</button>`)
        .join(' ')

    const safeDraft = encodeURIComponent(it.reply_draft || '')

    return `
    <div class="dv-card" data-id="${it.id}" data-status="${it.status}" style="background: var(--bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem;">
            <div style="font-size:0.8rem;color:var(--text-muted);">@${esc(it.commenter_handle)} · ${esc(it.platform)} · ${esc(timeAgo(it.comment_posted_at))}</div>
        </div>
        <div style="font-size:0.95rem;color:white;margin-bottom:0.8rem;">${esc(it.comment_text)}</div>
        <div style="display:flex;gap:0.6rem;align-items:center;background:rgba(255,255,255,0.02);border:1px solid var(--card-border);border-radius:8px;padding:0.5rem;margin-bottom:0.8rem;">
            ${it.post.thumbnail_url ? `<img src="${esc(it.post.thumbnail_url)}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;flex:0 0 36px;"/>` : ''}
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.75rem;color:var(--secondary);">@${esc(it.post.account_handle)}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc((it.post.caption || '').slice(0, 100))}</div>
            </div>
            <a href="${esc(it.post.post_url)}" target="_blank" style="color:var(--secondary);font-size:0.75rem;text-decoration:none;flex:0 0 auto;">View ↗</a>
        </div>
        <textarea data-id="${it.id}" onblur="dvSaveDraft(${it.id}, this.value)" style="width:100%;background:rgba(255,255,255,0.03);border:1px solid var(--card-border);color:white;border-radius:8px;padding:0.6rem;font-size:0.85rem;font-family:inherit;resize:vertical;min-height:60px;margin-bottom:0.6rem;">${esc(it.reply_draft || '')}</textarea>
        <div style="display:flex;justify-content:space-between;gap:0.4rem;flex-wrap:wrap;">
            <button onclick="dvCopyDraft(${it.id})" style="background:rgba(82,171,152,0.1);color:var(--secondary);border:1px solid rgba(82,171,152,0.3);padding:0.3rem 0.6rem;border-radius:6px;font-size:0.7rem;cursor:pointer;">Copy</button>
            <a href="${esc(it.post.post_url)}" target="_blank" style="background:rgba(255,255,255,0.05);color:white;border:1px solid var(--card-border);padding:0.3rem 0.6rem;border-radius:6px;font-size:0.7rem;text-decoration:none;">Open post</a>
            ${statusButtons}
        </div>
    </div>
    `
}
```

**Step 4: Add the JS handlers**

In `server/templates/admin.js`, find the existing `<script>` block (look around line 660+ where other handlers like `drag`, `drop`, `updateStatus` live) and append the following functions inside it (search for the closing `</script>` and insert just before it):

```js
        async function dvSaveDraft(id, draft) {
            try {
                await fetch('/mission-control-x89/daily-value/items/' + id, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reply_draft: draft }),
                })
            } catch (e) { console.error('dvSaveDraft', e) }
        }
        async function dvSetStatus(id, status, btn) {
            try {
                const res = await fetch('/mission-control-x89/daily-value/items/' + id, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status }),
                })
                if (res.ok) {
                    const card = btn.closest('.dv-card')
                    const target = document.getElementById('dv-cards-' + status)
                    if (card && target) target.appendChild(card)
                }
            } catch (e) { console.error('dvSetStatus', e) }
        }
        function dvCopyDraft(id) {
            const ta = document.querySelector('textarea[data-id="' + id + '"]')
            if (!ta) return
            navigator.clipboard.writeText(ta.value).catch(() => {})
        }
        const dvRunBtn = document.getElementById('dvRunNow')
        if (dvRunBtn) {
            dvRunBtn.addEventListener('click', async () => {
                dvRunBtn.disabled = true
                dvRunBtn.textContent = 'Running...'
                try {
                    await fetch('/mission-control-x89/daily-value/run', { method: 'POST' })
                    dvRunBtn.textContent = 'Started — refresh in ~60s'
                } catch (e) {
                    dvRunBtn.textContent = 'Failed'
                }
                setTimeout(() => { dvRunBtn.disabled = false; dvRunBtn.textContent = 'Run Now' }, 5000)
            })
        }
```

**Step 5: Run tests + smoke check**

Run: `npm test`
Expected: green.

Manual smoke (cannot be automated cleanly without a browser):
- `npm start` locally with `DATABASE_URL` pointing at a dev DB.
- Login at `/mission-control-x89/login`.
- Confirm "Daily Value" section appears above "Influencer Pipeline".
- Confirm empty-state "Empty" placeholder shows in each of the four columns.
- If you have any digest_items, confirm cards render with the textarea, status buttons, copy button, and post link.

**Step 6: Commit**

```bash
git add server/routes/admin.js server/templates/admin.js
git commit -m "feat: render Daily Value kanban above Influencer Pipeline in admin"
```

---

## Task 18: Final integration check and docs

**Files:**
- Modify: `CLAUDE.md` — add Daily Value to the routes table and the Layout section.

**Step 1: Update CLAUDE.md**

Edit `CLAUDE.md`. In the Routes table (around the "Mounted in `server/index.js`" section), add a row for the new sub-route:

```markdown
| `/mission-control-x89/daily-value` | comment digest list / patch / run / token-flip |
```

In the `server/jobs/` part of the Layout section, add:

```
    daily-value.js     # Daily Value comment digest cron
    digest-drafter.js  # batched Claude reply drafter
    digest-token.js    # HMAC tokens for one-shot email links
    strategies/        # relevance strategies (questions_v1)
```

In the `scripts/` part:

```
digest-now.js
digest-dry-run.js
import-watchlist.js
```

In the **Migration pattern** section, no changes needed — `migrate-runner.js` is just a separation, the pattern is identical.

Add a new section at the end called **Daily Value** mirroring the **Scout agent** section:

```markdown
## Daily Value (comment digest)

Nightly job that surfaces question-style comments on monitored accounts (pipeline contacts + manual `scout_watchlist`) for IG/TikTok, drafts replies via Claude Haiku 4.5, sends an email to `DIGEST_RECIPIENT`, and renders a kanban "Daily Value" board above the Influencer Pipeline in the admin panel.

Cron: `DIGEST_CRON` (default `'0 6 * * *'`, set `TZ=Europe/Oslo` in Railway).

Tables:
- `scout_watchlist` — manually-curated accounts to monitor
- `monitored_posts` — discovered posts (24h discovery, 7d comment-watch window)
- `digest_items` — surfaced comments + drafted replies + status (new/drafted/replied/skipped)

Helpers:
- `scripts/digest-now.js` — trigger one full run
- `scripts/digest-dry-run.js` — discover/fetch/filter/draft, no DB writes, no email
- `scripts/import-watchlist.js path/to/file.csv` — bulk seed (`handle,platform[,display,notes]`)

Config in `config/app.js`:
- `DIGEST_RECIPIENT`, `DIGEST_CRON`, `DIGEST_RELEVANCE_STRATEGY`, `DIGEST_MAX_COMMENTS_PER_POST`, `DIGEST_REPLY_MODEL`, `DIGEST_URL_BASE`

Future hooks: `digest_items.relevance_strategy` (slot for `ai_v1`), `digest_items.posted_via` (slot for semi-auto Apify reply posting).
```

**Step 2: Run the full test suite one more time**

Run: `npm test`
Expected: all suites green. Count: should be ~12 suites now (the 2 originals + ~10 new).

**Step 3: Run lint-equivalent — does `npm start` boot without errors?**

Run: `NODE_ENV=test npm start &; sleep 3; curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/mission-control-x89/login; kill %1`

Expected: `200` (login page renders), no module-load errors in stdout.

If `NODE_ENV=test` is needed because there's no DATABASE_URL locally, the cron is skipped — that's fine.

**Step 4: Verify the migration applies cleanly**

If you have local Postgres:

```bash
DATABASE_URL=postgres://localhost/breathe_dev npm run migrate
DATABASE_URL=postgres://localhost/breathe_dev npm run migrate
```

Expected: both runs succeed (`Migration complete`); the second is a no-op.

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document Daily Value comment digest in CLAUDE.md"
```

---

## Task 19: Pre-PR sanity sweep

Before opening a PR, run through this list:

**Step 1: Verify all tests pass**

Run: `npm test`
Expected: green, no skipped tests except the migration-test which skips without `TEST_DATABASE_URL`.

**Step 2: Verify the file inventory matches the design**

```bash
ls server/jobs/daily-value.js server/jobs/digest-drafter.js server/jobs/digest-token.js
ls server/jobs/strategies/index.js server/jobs/strategies/questions-v1.js
ls server/email/daily-value.js server/routes/daily-value.js server/db/migrate-runner.js
ls scripts/digest-now.js scripts/digest-dry-run.js scripts/import-watchlist.js
```

Expected: every path lists. If any is missing, find the task that should have created it and complete that task.

**Step 3: Walk the diff**

```bash
git log --oneline origin/main..HEAD
```

Expected commit list (in order):
1. feat: add daily-value schema (scout_watchlist, monitored_posts, digest_items)
2. feat: add questions_v1 relevance strategy with EN/ES/PT support
3. feat: add Apify getRecentPosts and getPostComments for IG/TikTok
4. chore: add digest config block (cron, recipient, strategy, model)
5. feat: add HMAC-signed one-shot tokens for digest email links
6. feat: resolve monitored accounts (pipeline + watchlist union)
7. feat: discoverPosts step inserts new posts via Apify per account
8. feat: fetchCommentsForActivePosts walks 7-day window per post
9. feat: batch Claude reply drafter for digest items
10. feat: persistDigestItems with platform+comment_id idempotency
11. feat: render digest email with token-signed Mark replied links
12. feat: runDailyValue orchestrates discover→fetch→filter→draft→persist→email
13. feat: register Daily Value nightly cron
14. feat: add scripts/digest-now and digest-dry-run for manual triggers
15. feat: bulk import watchlist from CSV
16. feat: Daily Value routes (list, patch, run, token-flip)
17. feat: render Daily Value kanban above Influencer Pipeline in admin
18. docs: document Daily Value comment digest in CLAUDE.md

**Step 4: Open the PR**

```bash
git push -u origin Sveisan/daily-comment-digest
gh pr create --base main --title "feat: Daily Value comment digest (IG+TikTok)" --body "$(cat <<'EOF'
## Summary

- Nightly cron at 06:00 Europe/Oslo that scrapes comments on Instagram + TikTok posts of pipeline creators and a manual watch-list, filters question-style comments, drafts replies via Claude Haiku 4.5, sends a digest email, and renders a "Daily Value" kanban above the Influencer Pipeline in `/mission-control-x89`.
- v1 ships with deterministic question filter (`questions_v1`) and Claude-drafted replies. Schema reserves slots for `ai_v1` relevance scoring and `posted_via` semi-auto posting.
- Manual click-through reply flow; one-shot HMAC-tokened "Mark replied" links in the email so triage works from the inbox without logging in.

## Design doc

`docs/plans/2026-04-26-daily-value-comment-digest-design.md`

## Test plan

- [ ] `npm test` is green
- [ ] On a dev DB: `npm run migrate` is idempotent (second run no-ops)
- [ ] Seed the watch-list with `node scripts/import-watchlist.js fixtures/watchlist.csv`
- [ ] `node scripts/digest-dry-run.js` prints accounts → posts → filtered comments → drafts (no email, no `digest_items` writes)
- [ ] `node scripts/digest-now.js` performs the full flow and lands an email at `DIGEST_RECIPIENT`
- [ ] `/mission-control-x89` shows "Daily Value" section above "Influencer Pipeline"; cards render with status buttons, draft textarea, copy button, post link
- [ ] One-shot link in the email flips an item's status to `replied` (and is idempotent on re-hit)
- [ ] Set `TZ=Europe/Oslo` and `DIGEST_URL_BASE=https://<deployed-host>` in Railway before merge
EOF
)"
```

If `gh` isn't authed, push and open the PR through the UI instead.

---

## Done.

You shipped:
- 3 new tables (idempotent migration)
- 1 cron job (06:00 Europe/Oslo) + 3 manual scripts
- Apify scrapers for IG/TikTok recent posts + post comments
- Pluggable relevance strategy (`questions_v1`) with `ai_v1` slot reserved
- Batched Claude reply drafter
- Resend email with HMAC one-shot status links
- Admin kanban board above Influencer Pipeline
- ~10 test files covering each unit and the orchestrator
- Updated CLAUDE.md
