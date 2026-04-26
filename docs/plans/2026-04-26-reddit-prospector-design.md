# Reddit Prospector — Design

## Goal

Find recent Reddit posts/comments where someone is asking a question Breathe Collection can help with. Draft a neutral, helpful reply, write the candidate to the DB. Humans triage in the admin panel and post manually on Reddit. The agent never auto-posts.

Audience priority: anti-gamification refugees (Calm/Headspace/Breathwrk dropouts) + pain-point seekers (panic attacks, sleep, burnout). Secondary: biohackers (Huberman/Wim Hof followers).

## Architecture

Scheduled Node-cron job, every 6 hours (`0 */6 * * *`), cap ~10 candidates per run. Direct fetch from `reddit.com/r/<sub>/new.json` and `/comments.json` via Node `fetch`. No OAuth, no Apify (independent of the existing quota issues). Uses `Anthropic` SDK Claude Haiku for judgment + drafting (batched, same pattern as `digest-drafter.js`).

Same shape as the Daily Value job: discover → filter (deterministic) → judge+draft (LLM, batched) → persist with unique constraint → log summary to `scout_logs` with `Reddit:` prefix.

## Subreddits (seed)

- **Anti-gamification (audience=anti_gamification):** getdisciplined
- **Pain points (audience=pain_point):** Anxiety, PanicAttack, insomnia, sleep, decidingtobebetter
- **Biohackers (audience=biohacker):** Biohackers, HubermanLab, Nootropics, breathwork, Wimhof

Stored in `reddit_subreddits` table; can be toggled active/inactive from admin or scripts.

## Schema (added to `server/db/migrate-runner.js`)

`reddit_subreddits`: name UNIQUE, audience CHECK enum, is_active, last_fetched_at, last_fetch_error, notes.

`reddit_candidates`: id, kind ('post'|'comment'), platform='reddit', subreddit, thread_id, parent_id (for comments), thread_url, author_handle, title, body, posted_at, score, num_comments, audience, draft_reply, draft_contains_pitch, draft_model, draft_generated_at, status ('pending'|'replied'|'needs_edit'|'dismissed'), reply_posted_at, status_changed_at, created_at. UNIQUE(platform, thread_id). Indexes on status and created_at.

## Filters (deterministic, in `reddit-filters.js`)

**Post reject:** `!is_self`, stickied, over_18, author in {[deleted], AutoModerator}, score < 0, older than 24h, num_comments > 8, link_flair in {meme, humor, media, off-topic}, no `?` and no question lead. Plus copyright topics: lyrics / tattoos / song translations / homework — skip.

**Comment reject:** author in {[deleted], AutoModerator}, score < 1, older than 24h, body length > 500 or < 30, no `?` and no question lead, parent has > 50 comments and comment score < 3.

Question-lead regex reuses the patterns from `strategies/questions-v1.js` (English/Spanish/Portuguese), exposed as a small helper.

## Judgment + drafting (`reddit-judge.js`)

Single Claude call per batch (up to 10 items). Returns JSON array `[{thread_id, keep, contains_pitch, draft}]`. We:
- Drop `keep:false`.
- Keep only `draft` for survivors.
- `contains_pitch=true` only when OP literally asked "what app/tool should I use" — surfaced as a badge in the UI.
- Default tone: neutral, 2-4 sentences, Reddit-native voice (no em-dashes, no enumerated lists, no AI tells). System prompt enforces.

Model: `claude-haiku-4-5-20251001` (same as Daily Value).

## Cron + config

`config/app.js` adds:
```js
reddit: {
  cron: process.env.REDDIT_CRON || '0 */6 * * *',
  maxCandidatesPerRun: parseInt(process.env.REDDIT_MAX_CANDIDATES, 10) || 10,
  judgeModel: process.env.REDDIT_JUDGE_MODEL || 'claude-haiku-4-5-20251001',
  contactEmail: process.env.REDDIT_CONTACT_EMAIL || 'support@breathecollection.app',
  userAgent: process.env.REDDIT_USER_AGENT || `node:breathe-collection:1.0 (contact: ${process.env.REDDIT_CONTACT_EMAIL || 'support@breathecollection.app'})`,
}
```

Cron registered in `server/jobs/scheduler.js` next to the existing entries.

## Admin UI

New stacked kanban above Daily Value: "Reddit Prospector". Columns: **Pending → Replied → Needs Edit → Dismissed**. Each card shows kind (post/comment), subreddit, author, title (post or parent post for comments), body preview, draft (editable), pitch badge if applicable, link to Reddit thread (new tab), and status-change buttons. "Mark replied" stamps `reply_posted_at`. Owner-only "Run Now" button on the section header.

API mounted at `/mission-control-x89/reddit`:
- `GET /items?days=7` → byStatus payload
- `PATCH /items/:id` → update status / draft_reply
- `POST /run` → trigger ad-hoc (owner only)
- `POST /subreddits` → add a subreddit (owner only) — keeps the seed list editable without a deploy

## Scripts

- `scripts/reddit-now.js` — manual trigger of a full run.
- `scripts/reddit-dry-run.js` — fetch + filter + judge, print summary, no DB writes.
- `scripts/import-subreddits.js path/to/file.csv` — bulk seed (`name,audience[,notes]`).

## Hard rules (enforced in code)

1. Never auto-post — there is no posting code path. The job ends at the DB insert.
2. Backoff on 429 / 5xx and end the run; do not loop.
3. Drop copyright/homework topics in the deterministic filter.
4. Dedup is enforced by `UNIQUE(platform, thread_id)` plus a pre-fetch Set of known IDs.
