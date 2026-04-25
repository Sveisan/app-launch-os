# Breathe.Collection.Web

Creator management platform for the Breathe Collection breathwork app: discovers creators (Scout agent), runs outreach, tracks a pipeline, and serves SEO content + a video studio.

## Stack

- **Runtime**: Node.js, CommonJS (`"type": "commonjs"` — no ESM, no build step)
- **Server**: Express 5
- **DB**: PostgreSQL (Railway), `pg` Pool, raw SQL (no ORM)
- **AI**: `@anthropic-ai/sdk` (Claude) — Scout agent + content generation
- **Scraping**: `apify-client`
- **Email**: `resend`
- **Audio**: ElevenLabs (via custom integration)
- **Video**: `canvas` + `fluent-ffmpeg`
- **Auth**: `jsonwebtoken` + `bcryptjs` (cookie-based JWT)
- **Scheduling**: `node-cron`
- **Tests**: Jest + Supertest (`jest --runInBand`)
- **Frontend**: Static HTML in `public/` (no React/Vue/Next.js)
- **Deploy**: Railway via `railway.toml` — auto-deploys on push, runs `npm run migrate && npm start`

## Layout

```
server/
  index.js           # entry — mounts routes, boots jobs/scheduler
  db/
    index.js         # pg Pool
    migrate.js       # idempotent SQL block (run on every deploy)
    auth.js          # JWT + bcrypt helpers
  routes/
    admin.js         # /mission-control-x89 (JWT, owner|freelancer)
    creator.js       # /api/apply
    waitlist.js      # /api/waitlist
    eligibility.js   # /api/check-eligibility
    feedback.js      # /api/feedback
    video-studio.js  # /api/video-studio
    content.js       # /breathing + /sitemap.xml
    library.js       # /library
  jobs/
    scheduler.js     # node-cron registry
    scout.js         # Scout agent (creator discovery)
    content-generator.js
    video-generator.js
    lung-video-generator.js
    topic-queue.js
  middleware/
  platforms/         # platform-specific scrapers/clients
  email/             # Resend templates/senders
  templates/
public/              # static HTML (index, creators, breathe/, assets/)
scripts/             # one-off CLIs (content-admin, scout-now, view-scout, import-codes, audits…)
tests/
config/
docs/
```

## Routes (mounted in `server/index.js`)

| Path | Module |
|---|---|
| `/api/apply` | creator applications |
| `/api/waitlist` | waitlist signups |
| `/api/check-eligibility` | eligibility checks |
| `/api/feedback` | feedback |
| `/api/video-studio` | video pipeline |
| `/mission-control-x89` | admin panel (JWT) |
| `/breathing` + `/sitemap.xml` | SEO content |
| `/library` | library |

## Admin panel

- Mounted at `/mission-control-x89` (obscured path).
- JWT in cookie, two roles: **owner** and **freelancer**.
- `admin_users` table; create via `node scripts/create-admin.js`.
- Frontend served from `public/` HTML + inline JS (no framework).

## Scout agent

Core domain. Lives in `server/jobs/scout.js`, runs via `server/jobs/scheduler.js`.

Flow: keyword-driven discovery (multi-language hashtags) → Apify scraping → Claude fit-scoring + outreach drafting → kanban pipeline (`pipeline_status`: `discovery` → `researching` → `approved` → `outreach_sent` / `rejected`).

Tables it touches:
- `contacts` — pipeline rows, unique on `(handle, platform)`
- `scout_keywords` — multi-language hashtags + `yield_score`, `last_used_at`
- `scout_keyword_suggestions` — feedback loop
- `scout_memory` — distilled persona insights from approvals/rejections
- `scout_blocklist` — never-contact list (seeded with Huberman/Wim Hof/Headspace/Calm)
- `scout_logs` — system log

Helpers:
- `scripts/scout-now.js` — trigger a run
- `scripts/scout-dry-run.js` — preview without writes
- `scripts/view-scout.js` (also `npm run scout:view`) — inspect state
- `scripts/import-scout-leads.js` — bulk import

## Migration pattern

Single idempotent SQL block in `server/db/migrate.js`. Run on every deploy via `npm run migrate`.

- `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE … ADD COLUMN IF NOT EXISTS`
- No migration history table, no rollback, forward-only
- Seed data (`scout_keywords`, `scout_blocklist`) inserted with `ON CONFLICT DO NOTHING`
- Constraint adds wrapped in `DO $$ … pg_constraint check $$`
- Backwards-compat columns are kept (e.g. `followers TEXT` alongside typed `followers_count INTEGER` + `auto_approved BOOLEAN`)

When adding schema: append to the same block, make it idempotent, never edit prior statements destructively.

## Run locally

```bash
npm install
# .env with: DATABASE_URL, ANTHROPIC_API_KEY, APIFY_TOKEN, RESEND_API_KEY,
#            JWT_SECRET, ELEVENLABS_API_KEY, etc.
npm run migrate     # apply schema
npm start           # server on :3000 (PORT overridable)
npm test            # jest --runInBand
```

`NODE_ENV=test` skips boot of `jobs/scheduler` (so tests don't trigger cron).

Useful scripts: `npm run content` / `npm run generate` (content-admin), `npm run scout:view`.

## Conventions

- CommonJS `require` everywhere.
- Raw SQL via `pool.query` from `server/db/index.js`.
- Static HTML pages with inline JS — escape template literals carefully (recent commits fixed nested-template-literal bugs in `admin.js`).
- Generic 500 handler in `server/index.js`; route-level errors should `next(err)`.
- Background work belongs in `server/jobs/`, registered through `scheduler.js`.
