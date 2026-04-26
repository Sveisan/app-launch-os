# Daily Value — Comment Digest Design

**Date:** 2026-04-26
**Status:** Approved, ready for implementation planning

## Problem

The user wants to "show up and add value" in the comment threads of accounts that matter — pipeline creators we're warming up for outreach, and a manually-curated watch-list of accounts (competitors, big breathwork voices, anyone). Today this requires opening Instagram and TikTok, manually scrolling, spotting questions, and remembering to reply. It doesn't happen consistently.

The end-state is a daily 06:00 email that surfaces *only* comments worth replying to (questions first), with a draft reply in Breathe Collection's voice ready to copy-paste, plus a persistent admin board ("Daily Value") above the existing Influencer Pipeline so missed days aren't lost work.

## Decisions

- **Whose posts:** Pipeline creators (`pipeline_status` in discovery/researching/approved) **plus** a manual `scout_watchlist` (separate table — does not muddy `contacts` semantics).
- **Platforms:** Instagram + TikTok. X and YouTube postponed.
- **Relevance:** Questions-only filter (deterministic regex with EN/ES/PT support) ships in v1. AI scoring (`ai_v1`) postponed; the data model has a `relevance_strategy` column so it slots in without migration.
- **Watch-list management:** New table + admin UI page + `scripts/import-watchlist.js` for bulk seed. CLI-only or `contacts`-table reuse rejected (semantic muddying / unmaintainable inputs).
- **Post-selection strategy:** Hybrid — every nightly run discovers posts published in the last 24h, AND re-fetches comments for any post in the 7-day window. Tracked per `(post_id, last_comments_fetched_at)`. Uncapped (with run-summary observability so a runaway can be detected and capped later).
- **Delivery surface:** Daily email **plus** persistent admin page (`Daily Value` section above Influencer Pipeline). Email creates the habit; admin board catches missed days.
- **Per-comment payload:** Comment + post context (caption, thumbnail) + Claude-drafted reply. Built like the Influencer Pipeline (kanban, same CSS classes, same drag/drop infra).
- **Posting flow:** Manual click-through in v1 (open native IG/TikTok, paste, mark replied). Schema includes `posted_via` slot for semi-auto Apify posting later.
- **Architecture:** Single nightly cron job at 06:00 Europe/Oslo. `scripts/digest-now.js` for manual triggers. Two-stage scrape (hourly + daily) postponed until watch-list growth justifies it.

## Data model

Three new tables, idempotent additions to `server/db/migrate.js`. No changes to `contacts`.

### `scout_watchlist`

Accounts to monitor that aren't (necessarily) Scout pipeline contacts.

```sql
CREATE TABLE IF NOT EXISTS scout_watchlist (
  id            SERIAL PRIMARY KEY,
  handle        TEXT NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('instagram','tiktok')),
  display_name  TEXT,
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (handle, platform)
);
```

### `monitored_posts`

Posts we've discovered and are watching for new comments. Lifecycle: discovered (within 24h of publish) → watched (kept active for 7d after publish) → archived.

```sql
CREATE TABLE IF NOT EXISTS monitored_posts (
  id                       SERIAL PRIMARY KEY,
  platform                 TEXT NOT NULL,
  post_id                  TEXT NOT NULL,
  account_handle           TEXT NOT NULL,
  source                   TEXT NOT NULL CHECK (source IN ('pipeline','watchlist')),
  source_ref_id            INTEGER,                       -- contacts.id or scout_watchlist.id
  post_url                 TEXT NOT NULL,
  caption                  TEXT,
  thumbnail_url            TEXT,
  published_at             TIMESTAMPTZ,
  first_seen_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_comments_fetched_at TIMESTAMPTZ,
  archived_at              TIMESTAMPTZ,
  UNIQUE (platform, post_id)
);
```

### `digest_items`

One row per surfaced comment. Backs both the email and the Daily Value board.

```sql
CREATE TABLE IF NOT EXISTS digest_items (
  id                  SERIAL PRIMARY KEY,
  monitored_post_id   INTEGER NOT NULL REFERENCES monitored_posts(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL,
  comment_id          TEXT NOT NULL,
  commenter_handle    TEXT NOT NULL,
  comment_text        TEXT NOT NULL,
  comment_posted_at   TIMESTAMPTZ,
  relevance_strategy  TEXT NOT NULL,                      -- 'questions_v1' now; 'ai_v1' later
  relevance_score     NUMERIC,                            -- null for questions_v1; 1-5 later
  reply_draft         TEXT,
  reply_draft_model   TEXT,
  status              TEXT NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new','drafted','replied','skipped')),
  posted_via          TEXT,                               -- null now; 'manual'|'apify' later
  surfaced_in_digest_at TIMESTAMPTZ,
  status_changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, comment_id)
);
CREATE INDEX IF NOT EXISTS idx_digest_items_status ON digest_items (status);
CREATE INDEX IF NOT EXISTS idx_digest_items_surfaced ON digest_items (surfaced_in_digest_at DESC);
```

**Why these shapes:**
- `monitored_posts.source` + `source_ref_id` traces every comment back to the reason we were watching.
- `relevance_strategy` is a string column, not a JOIN — `'ai_v1'` rows write alongside `'questions_v1'` rows. No migration. Historical A/B comparison is free.
- `status='drafted'` exists from day one as the slot for "edited, not yet posted."
- `UNIQUE (platform, comment_id)` makes re-runs idempotent.

## Pipeline (control flow)

New file `server/jobs/daily-value.js`. Registered in `server/jobs/scheduler.js` as `cron.schedule('0 6 * * *', ...)`. `TZ=Europe/Oslo` set in Railway.

1. **Resolve monitored accounts.** Union pipeline contacts (discovery/researching/approved) and active watch-list, dedup on `(platform, handle)`, pipeline wins on collision.
2. **Discover/refresh posts per account.** `platforms.getRecentPosts(platform, handle, { sinceHours: 24 })`. Insert into `monitored_posts` with `ON CONFLICT (platform, post_id) DO NOTHING`.
3. **Build comment-fetch worklist.** `monitored_posts WHERE archived_at IS NULL AND published_at > NOW() - INTERVAL '7 days'`, ordered by `last_comments_fetched_at NULLS FIRST`.
4. **Fetch comments per post.** `platforms.getPostComments(platform, post_id)`. On success, update `last_comments_fetched_at`. Per-post failure is logged and skipped.
5. **Filter via relevance strategy.** Dispatcher loads `strategies/<DIGEST_RELEVANCE_STRATEGY>.js`. v1 is `questions_v1` — regex on `?` ending and question-word leading patterns (EN, ES, PT).
6. **Draft replies in batch.** Claude (`claude-haiku-4-5`) batched 20 comments per call, JSON output, voice prompt lifted from existing scout outreach for consistency. Constraints: <280 chars, no emojis unless commenter used them, no links.
7. **Persist as `digest_items`.** `INSERT … ON CONFLICT (platform, comment_id) DO NOTHING`.
8. **Render and send email.** Group by post, render HTML+text, `sendNotification(...)`. Empty digest = no send.
9. **Log run summary.** One `scout_logs` row with accounts scanned, posts discovered, comments fetched, items surfaced, items deduplicated, Apify calls, Claude calls, wall time.

**Failure isolation:** per-account and per-post try/catch. Only catastrophic failures (DB down, missing API keys) abort the run. `NODE_ENV=test` skips cron registration (existing pattern).

## Platform integration

Two new functions in `server/platforms/index.js`. Mirrors the existing `getFollowers` shape — per-platform helpers + dispatcher.

```js
async function getRecentPosts(platform, handle, { sinceHours = 24 } = {})
async function getPostComments(platform, postId)
```

**Normalized post:** `{ platform, post_id, post_url, caption, thumbnail_url, published_at }`.
**Normalized comment:** `{ platform, post_id, comment_id, commenter_handle, comment_text, comment_posted_at }`.

- **Instagram posts:** `apify~instagram-profile-scraper` (already in use), reads `latestPosts` from response.
- **Instagram comments:** `apify~instagram-comment-scraper`, `{ directUrls: [post_url], resultsLimit: DIGEST_MAX_COMMENTS_PER_POST }`.
- **TikTok posts:** `clockworks~tiktok-scraper` with `resultsType: 'videos'`.
- **TikTok comments:** `clockworks~tiktok-comments-scraper`, `{ postURLs: [post_url], commentsPerPost: DIGEST_MAX_COMMENTS_PER_POST }`.

Field-missing defense identical to existing pattern: loud throw with a "actor response may have changed" message. Per-post try/catch contains blast radius.

**Out of scope for platform integration v1:** comment threading, commenter follower enrichment, video/image analysis.

## UI

### Email — `server/email/daily-value.js`

`renderDigestEmail({ items, runSummary })` returns `{ subject, text, html }`. Sent via existing `sendNotification`.

- **Subject:** `Daily Value — N comments worth showing up for (DD MMM)`
- **HTML:** vertically-stacked cards, one per `monitored_post` ordered by `published_at DESC`. Each card: thumbnail (80px left), creator handle + platform badge, caption (truncated 200 chars), then comment rows. Each comment row: commenter handle, comment text, drafted reply in muted bordered box, two buttons:
  - **Open post** → `post_url`.
  - **Mark replied** → one-shot HMAC-tokened URL flipping `status` to `replied` (idempotent — re-hits do nothing).
- **Footer:** run summary line.
- **Plain-text fallback** required by `sendNotification`.

### Admin board — new section in `server/templates/admin.js`

Section title: **"Daily Value"**. Inserted **above** the existing "Influencer Pipeline" h2 (admin.js:237). Reuses `kanban-board`, `kanban-column`, `kanban-card` classes and the existing drag/drop JS (with `data-board="daily-value"` namespace prefix so the existing `drop()` handler can branch).

**Four columns:** `New` → `Drafted` → `Replied` → `Skipped`.

**Card:**
- Top row: commenter handle + platform badge + relative time.
- Comment text.
- Post context strip: thumbnail (40px), creator handle, caption (truncated 100 chars), "View post ↗".
- Reply draft in `contenteditable` textarea, auto-saves on blur.
- Bottom row: "Copy reply", "Open post", status transition buttons.

**Backend routes** (mounted under `/mission-control-x89`):
- `GET /daily-value/items` → grouped-by-status payload, default last 7 days, `?days=N` override.
- `PATCH /daily-value/items/:id` → `{ status?, reply_draft? }`. `checkAuth`, owner or freelancer.
- `POST /daily-value/run` → owner-only, mirrors `/trigger`.
- `GET /daily-value/items/:id/status?to=replied&token=…` → one-shot email-link endpoint.

Initial payload embedded inline in dashboard render (matches existing pipeline pattern); subsequent updates are XHR.

**Empty state:** muted card "No items yet — next digest at 06:00. [Run now]".

No new CSS, no new JS framework.

## Testing

Jest + Supertest, `--runInBand`, `NODE_ENV=test` skips scheduler. Apify and Anthropic mocked at module boundaries.

- `tests/jobs/daily-value.test.js`
  - Account resolution: union, dedup, watchlist-only, pipeline-only, inactive watchlist excluded.
  - `monitored_posts` insert idempotent on `(platform, post_id)`.
  - 7-day window correctness.
  - Per-post failure does not abort run.
  - `digest_items` insert idempotent (re-run adds zero).
- `tests/strategies/questions-v1.test.js`
  - Passes English/Spanish/Portuguese question forms.
  - Rejects emoji-only, "first!", "love this", "check my profile".
- `tests/email/daily-value.test.js`
  - Empty digest = no send.
  - Multi-post grouping correctness.
  - One-shot status token round-trips.
- `tests/routes/daily-value.test.js`
  - `GET /items` requires auth, returns grouped payload.
  - `PATCH /items/:id` updates status + draft, owner and freelancer both allowed.
  - `POST /run` is owner-only.
  - One-shot token endpoint flips status, idempotent on re-hit.
- `tests/db/migrate-daily-value.test.js`
  - Migration applied twice — no errors.

## Config & ops

**`config/app.js` + `.env`:**
- `DIGEST_RECIPIENT` — defaults to `config.supportEmail`.
- `DIGEST_CRON` — defaults to `'0 6 * * *'`.
- `DIGEST_RELEVANCE_STRATEGY` — defaults to `'questions_v1'`.
- `DIGEST_MAX_COMMENTS_PER_POST` — defaults to `100`.
- `TZ=Europe/Oslo` set in Railway env.

**Migration:** appended to `server/db/migrate.js` as one new block (three CREATE TABLE + two indexes). No seed data.

**Scripts:**
- `scripts/digest-now.js` — runs `runDailyValue()`, prints summary.
- `scripts/import-watchlist.js path/to/file.txt` — bulk import. Lines: `handle,platform,display_name?,notes?`. `ON CONFLICT … DO UPDATE SET is_active=TRUE`.
- `scripts/digest-dry-run.js` — steps 1–6, prints what would be surfaced + drafted, no DB writes, no email.

**Rollout:** deploy → `scripts/import-watchlist.js` → `scripts/digest-now.js` to verify → cron takes over.

**Run summary** appears automatically in the existing admin "System Log" view via `scout_logs`.

## Out of scope (v1)

Slot exists, design admits the gap; not building today:

- AI relevance scoring (`ai_v1` strategy).
- Semi-auto reply posting via Apify (`posted_via` is the slot).
- Comment threading, commenter follower enrichment, video/image analysis.
- Per-creator notification opt-out, per-strategy A/B testing dashboards.
- Multi-recipient digest (per-freelancer routing).
- X and YouTube platform support.
