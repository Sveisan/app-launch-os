# app-launch-os Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a reusable agency web framework (Node/Express + PostgreSQL + static HTML) deployed on Railway, with Breathe Collection as the first client deployment.

**Architecture:** Static HTML frontend served by Express. API routes handle form submissions (validate → insert to PostgreSQL → send email notification). All client-specific values centralized in `config/app.js` so any future client is a one-file config change.

**Tech Stack:** Node.js, Express, node-postgres (`pg`), Nodemailer, Jest, Supertest, Railway, PostgreSQL

---

## Full Context

### What this is

Breathe Collection is an iOS breathing exercise app (9 techniques: Wim Hof, Box, Huberman, SEAL, Sleep, Calm, Belly, Release, Custom). This website is the public face of the app and a point of contact for:
- Influencers/creators wanting to partner (content, live breathing events, giveaway codes)
- Android waitlist signups
- General inquiries

### Repo strategy

**`app-launch-os`** is the GitHub template repo — the framework. Each client gets their own repo forked from it. Swapping clients = fork + edit `config/app.js`. Do NOT use a monorepo or branch-per-client.

**`breathe-collection-web`** is the first client fork.

After pushing `app-launch-os` to GitHub, enable "Template repository" in repo settings before forking.

### Brand

- Font: Outfit (Google Fonts), weights 300/400/500/600
- Background: `#000000`
- Primary teal: `#2C7873`
- Secondary teal: `#52AB98`
- Accent orange: `#E07B39`
- Text: `#FFFFFF`
- Muted text: `#A0A0A0`
- Card background: `rgba(255,255,255,0.03)`
- Card border: `rgba(255,255,255,0.08)`
- Aesthetic: dark, minimal, discipline-focused. No emojis, no bloat.

### Two existing HTML pages (already designed — do not restyle)

`public/index.html` — main app landing page. Contains:
- Animated breathing orb hero
- 9 technique cards grid
- 3 feature callouts (eyes-closed sessions, fully configurable, no bloat)
- Social proof (4.8 stars, two user quotes)
- Android waitlist form (currently `mailto:` — Task 8 fixes this)
- Creator CTA block linking to creators.html

`public/creators.html` — creator partnership page. Contains:
- Hero: "Partner with Breathe Collection"
- 3 perk cards (Free lifetime Pro, Giveaway codes, Early access)
- How it works flow (Apply → Get approved → Receive codes → Post your giveaway)
- Application form (currently `mailto:` — Task 8 fixes this)
- FAQ section

Both pages are complete and correct. The only changes needed are replacing `mailto:` forms with `fetch()` API calls.

### Database tables

| Table | Purpose |
|-------|---------|
| `contacts` | Creator applications. Named `contacts` (not `creator_applications`) for compatibility with future modules: Reddit monitor, influencer builder, affiliate onboarding. |
| `waitlist` | Android waitlist signups |
| `affiliates` | Future module — create as stub now |
| `conversations` | Future module — create as stub now |

### Form → API mapping

| Form | Endpoint | Table |
|------|----------|-------|
| Creator application (creators.html) | POST /api/apply | contacts |
| Android waitlist (index.html) | POST /api/waitlist | waitlist |

### Email

Each submission triggers one email notification to `support@breathecollection.com`. Use Nodemailer with SMTP (Gmail app password or SendGrid). Credentials stored as Railway env vars, never hardcoded.

---

## File Structure

```
app-launch-os/
├── public/
│   ├── index.html
│   └── creators.html
├── config/
│   └── app.js
├── server/
│   ├── index.js
│   ├── routes/
│   │   ├── creator.js
│   │   └── waitlist.js
│   ├── db/
│   │   ├── index.js
│   │   └── migrate.js
│   └── email/
│       └── index.js
├── tests/
│   └── routes/
│       ├── creator.test.js
│       └── waitlist.test.js
├── .env.example
├── .gitignore
├── package.json
└── railway.toml
```

---

## Task 1: Project Init

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `railway.toml`

**Step 1: Initialize npm**

Run in the project root:
```bash
npm init -y
```

**Step 2: Install dependencies**

```bash
npm install express pg nodemailer dotenv
npm install --save-dev jest supertest
```

**Step 3: Edit `package.json` — replace the `scripts` block and add Jest config**

The `scripts` block should be:
```json
"scripts": {
  "start": "node server/index.js",
  "migrate": "node server/db/migrate.js",
  "test": "jest --runInBand"
}
```

Add this at the root level of `package.json` (alongside `scripts`):
```json
"jest": {
  "testEnvironment": "node"
}
```

**Step 4: Create `.env.example`**

```
DATABASE_URL=postgresql://user:password@host:5432/dbname
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
NODE_ENV=development
```

**Step 5: Create `.gitignore`**

```
node_modules/
.env
```

**Step 6: Create `railway.toml`**

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm start"
restartPolicyType = "on_failure"
```

**Step 7: Commit**

```bash
git init
git add package.json package-lock.json .env.example .gitignore railway.toml
git commit -m "chore: project init"
```

---

## Task 2: Config Module

**Files:**
- Create: `config/app.js`

**Step 1: Create `config/app.js`**

```js
require('dotenv').config()

module.exports = {
  appName: 'Breathe Collection',
  supportEmail: 'support@breathecollection.com',
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  db: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },
}
```

This is the only file that changes between clients. Every other file reads from this.

**Step 2: Commit**

```bash
git add config/app.js
git commit -m "feat: add centralised app config"
```

---

## Task 3: Database Module + Schema

**Files:**
- Create: `server/db/index.js`
- Create: `server/db/migrate.js`

**Step 1: Create `server/db/index.js`**

```js
const { Pool } = require('pg')
const config = require('../../config/app')

const pool = new Pool(config.db)

module.exports = { pool }
```

**Step 2: Create `server/db/migrate.js`**

```js
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
  `)
  console.log('Migration complete')
  await pool.end()
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
```

Note: `affiliates` and `conversations` are stubs for future modules (affiliate onboarding, Reddit monitor). Create them now so future modules don't need a schema change.

**Step 3: Commit**

```bash
git add server/db/index.js server/db/migrate.js
git commit -m "feat: add db module and migration script"
```

---

## Task 4: Email Module

**Files:**
- Create: `server/email/index.js`

**Step 1: Create `server/email/index.js`**

```js
const nodemailer = require('nodemailer')
const config = require('../../config/app')

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: false,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
})

async function sendNotification({ subject, text }) {
  await transporter.sendMail({
    from: `"${config.appName}" <${config.smtp.user}>`,
    to: config.supportEmail,
    subject,
    text,
  })
}

module.exports = { sendNotification }
```

**Step 2: Commit**

```bash
git add server/email/index.js
git commit -m "feat: add email notification module"
```

---

## Task 5: POST /api/apply Route (TDD)

**Files:**
- Create: `tests/routes/creator.test.js`
- Create: `server/routes/creator.js`

**Step 1: Write the failing test**

Create `tests/routes/creator.test.js`:

```js
const request = require('supertest')
const express = require('express')

jest.mock('../../server/db/index', () => ({
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  },
}))

jest.mock('../../server/email/index', () => ({
  sendNotification: jest.fn().mockResolvedValue(),
}))

const creatorRouter = require('../../server/routes/creator')

const app = express()
app.use(express.json())
app.use('/api/apply', creatorRouter)

describe('POST /api/apply', () => {
  const validBody = {
    name: 'Jane',
    email: 'jane@example.com',
    handle: '@jane',
    platform: 'instagram',
    followers: '10k-50k',
    niche: 'fitness',
    reason: 'I love breathwork',
  }

  it('returns 200 with valid body', async () => {
    const res = await request(app).post('/api/apply').send(validBody)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 400 when required field is missing', async () => {
    const { name, ...missing } = validBody
    const res = await request(app).post('/api/apply').send(missing)
    expect(res.status).toBe(400)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm test tests/routes/creator.test.js
```

Expected: FAIL — `Cannot find module '../../server/routes/creator'`

**Step 3: Create `server/routes/creator.js`**

```js
const express = require('express')
const router = express.Router()
const { pool } = require('../db/index')
const { sendNotification } = require('../email/index')

const REQUIRED = ['name', 'email', 'handle', 'platform', 'followers', 'niche', 'reason']

router.post('/', async (req, res) => {
  const missing = REQUIRED.filter(f => !req.body[f])
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` })
  }

  const { name, email, handle, platform, followers, niche, reason } = req.body

  await pool.query(
    `INSERT INTO contacts (name, email, handle, platform, followers, niche, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [name, email, handle, platform, followers, niche, reason]
  )

  await sendNotification({
    subject: `New creator application — ${name}`,
    text: `Name: ${name}\nEmail: ${email}\nHandle: ${handle}\nPlatform: ${platform}\nFollowers: ${followers}\nNiche: ${niche}\nReason: ${reason}`,
  })

  res.json({ ok: true })
})

module.exports = router
```

**Step 4: Run test to verify it passes**

```bash
npm test tests/routes/creator.test.js
```

Expected: PASS — 2 tests

**Step 5: Commit**

```bash
git add server/routes/creator.js tests/routes/creator.test.js
git commit -m "feat: add POST /api/apply route"
```

---

## Task 6: POST /api/waitlist Route (TDD)

**Files:**
- Create: `tests/routes/waitlist.test.js`
- Create: `server/routes/waitlist.js`

**Step 1: Write the failing test**

Create `tests/routes/waitlist.test.js`:

```js
const request = require('supertest')
const express = require('express')

jest.mock('../../server/db/index', () => ({
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  },
}))

jest.mock('../../server/email/index', () => ({
  sendNotification: jest.fn().mockResolvedValue(),
}))

const waitlistRouter = require('../../server/routes/waitlist')

const app = express()
app.use(express.json())
app.use('/api/waitlist', waitlistRouter)

describe('POST /api/waitlist', () => {
  it('returns 200 with valid email', async () => {
    const res = await request(app).post('/api/waitlist').send({ email: 'user@example.com' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 400 when email is missing', async () => {
    const res = await request(app).post('/api/waitlist').send({})
    expect(res.status).toBe(400)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm test tests/routes/waitlist.test.js
```

Expected: FAIL — `Cannot find module '../../server/routes/waitlist'`

**Step 3: Create `server/routes/waitlist.js`**

```js
const express = require('express')
const router = express.Router()
const { pool } = require('../db/index')
const { sendNotification } = require('../email/index')

router.post('/', async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email is required' })

  await pool.query('INSERT INTO waitlist (email) VALUES ($1)', [email])

  await sendNotification({
    subject: 'New Android waitlist signup',
    text: `Email: ${email}`,
  })

  res.json({ ok: true })
})

module.exports = router
```

**Step 4: Run test to verify it passes**

```bash
npm test tests/routes/waitlist.test.js
```

Expected: PASS — 2 tests

**Step 5: Commit**

```bash
git add server/routes/waitlist.js tests/routes/waitlist.test.js
git commit -m "feat: add POST /api/waitlist route"
```

---

## Task 7: Express Entry Point

**Files:**
- Create: `server/index.js`

**Step 1: Create `server/index.js`**

```js
const express = require('express')
const path = require('path')
const app = express()

app.use(express.json())
app.use(express.static(path.join(__dirname, '../public')))

app.use('/api/apply', require('./routes/creator'))
app.use('/api/waitlist', require('./routes/waitlist'))

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
```

**Step 2: Run all tests**

```bash
npm test
```

Expected: All 4 tests PASS

**Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: add express entry point"
```

---

## Task 8: Static Frontend

**Files:**
- Create: `public/index.html`
- Create: `public/creators.html`

### index.html

Copy the full HTML below into `public/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Breathe Collection | Nine Breathing Techniques. One Discipline.</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #000000;
            --primary: #2C7873;
            --secondary: #52AB98;
            --accent: #E07B39;
            --text-main: #FFFFFF;
            --text-muted: #A0A0A0;
            --card-bg: rgba(255, 255, 255, 0.03);
            --card-border: rgba(255, 255, 255, 0.08);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg);
            color: var(--text-main);
            line-height: 1.6;
            letter-spacing: 0.02em;
            -webkit-font-smoothing: antialiased;
        }
        section { padding: 5rem 1.5rem; max-width: 1200px; margin: 0 auto; }
        .hero {
            display: flex; flex-direction: column; align-items: center;
            text-align: center; min-height: 90vh; justify-content: center;
            position: relative; overflow: hidden; padding-top: 2rem;
        }
        .orb-container {
            position: relative; width: 250px; height: 250px;
            margin: 0 auto 3rem auto; display: flex;
            align-items: center; justify-content: center;
        }
        .orb {
            width: 120px; height: 120px;
            background: radial-gradient(circle at 30% 30%, rgba(82,171,152,0.9), rgba(44,120,115,0.4));
            border-radius: 50%;
            box-shadow: 0 0 60px rgba(82,171,152,0.6), inset 0 0 20px rgba(255,255,255,0.2);
            animation: breathe 8s ease-in-out infinite;
        }
        @keyframes breathe {
            0%, 100% { transform: scale(1); opacity: 0.8; box-shadow: 0 0 40px rgba(82,171,152,0.4); }
            50% { transform: scale(1.6); opacity: 1; box-shadow: 0 0 100px rgba(82,171,152,0.8); }
        }
        h1 { font-size: clamp(2.5rem,6vw,4.5rem); font-weight: 300; letter-spacing: -0.02em; margin-bottom: 1.5rem; line-height: 1.1; }
        .subtitle { font-size: clamp(1.1rem,2vw,1.4rem); color: var(--text-muted); max-width: 600px; margin: 0 auto 3rem auto; font-weight: 300; }
        .btn-primary {
            display: inline-flex; align-items: center; justify-content: center;
            background-color: var(--text-main); color: var(--bg);
            padding: 1rem 2.5rem; border-radius: 100px; text-decoration: none;
            font-weight: 500; font-size: 1.1rem; transition: all 0.3s ease;
            border: none; cursor: pointer;
        }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(255,255,255,0.1); }
        .btn-secondary {
            display: inline-flex; align-items: center; justify-content: center;
            background-color: transparent; color: var(--text-main);
            padding: 1rem 2.5rem; border-radius: 100px; text-decoration: none;
            font-weight: 400; font-size: 1rem; transition: all 0.3s ease;
            border: 1px solid var(--card-border); cursor: pointer;
        }
        .btn-secondary:hover { border-color: var(--secondary); color: var(--secondary); }
        .techniques { text-align: center; }
        .section-title { font-size: 2rem; font-weight: 300; margin-bottom: 4rem; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
        .card {
            background: var(--card-bg); border: 1px solid var(--card-border);
            border-radius: 16px; padding: 2.5rem 2rem; text-align: left;
            transition: transform 0.3s ease, border-color 0.3s ease;
            position: relative; overflow: hidden;
        }
        .card::before {
            content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: linear-gradient(135deg, rgba(82,171,152,0.05) 0%, transparent 100%);
            opacity: 0; transition: opacity 0.3s ease;
        }
        .card:hover { transform: translateY(-5px); border-color: rgba(82,171,152,0.3); }
        .card:hover::before { opacity: 1; }
        .card-name { font-size: 1.5rem; font-weight: 500; margin-bottom: 0.5rem; }
        .card-tagline { color: var(--secondary); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 1.5rem; }
        .card-intention { color: var(--text-muted); font-size: 0.95rem; font-weight: 300; }
        .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 3rem; text-align: center; padding: 8rem 1.5rem; }
        .feature-item h3 { font-size: 1.3rem; font-weight: 400; margin: 1.5rem 0 1rem 0; color: var(--secondary); }
        .feature-item p { color: var(--text-muted); font-weight: 300; }
        .feature-icon { width: 48px; height: 48px; margin: 0 auto; border-radius: 50%; background: rgba(82,171,152,0.1); display: flex; align-items: center; justify-content: center; color: var(--secondary); }
        .social-proof { text-align: center; background: var(--card-bg); border-top: 1px solid var(--card-border); border-bottom: 1px solid var(--card-border); }
        .stars { color: var(--accent); font-size: 1.5rem; letter-spacing: 0.2rem; margin-bottom: 1rem; }
        .rating-text { font-size: 1.2rem; font-weight: 300; margin-bottom: 3rem; }
        .quotes-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; max-width: 900px; margin: 0 auto; }
        .quote-card { padding: 2rem; }
        .quote-text { font-style: italic; font-weight: 300; font-size: 1.1rem; margin-bottom: 1.5rem; color: var(--text-muted); }
        .cta-section { text-align: center; max-width: 600px; padding: 8rem 1.5rem; }
        .waitlist-form { display: flex; gap: 1rem; margin-top: 2rem; justify-content: center; }
        .waitlist-form input {
            padding: 1rem 1.5rem; border-radius: 100px; border: 1px solid var(--card-border);
            background: rgba(255,255,255,0.05); color: white; font-family: inherit;
            width: 100%; max-width: 300px; outline: none; transition: border-color 0.3s ease;
        }
        .waitlist-form input:focus { border-color: var(--secondary); }
        .creator-block { margin-top: 6rem; padding-top: 6rem; border-top: 1px solid var(--card-border); }
        footer { text-align: center; padding: 4rem 1.5rem; border-top: 1px solid var(--card-border); color: var(--text-muted); font-size: 0.9rem; }
        footer a { color: var(--secondary); text-decoration: none; margin: 0 1rem; transition: color 0.3s ease; }
        footer a:hover { color: var(--text-main); }
        .footer-links { margin-bottom: 2rem; }
        @media (max-width: 768px) {
            .waitlist-form { flex-direction: column; align-items: center; }
            .waitlist-form input, .waitlist-form button { width: 100%; max-width: 100%; }
        }
    </style>
</head>
<body>
    <section class="hero">
        <div class="orb-container"><div class="orb"></div></div>
        <h1>Nine breathing techniques.<br>One discipline.</h1>
        <p class="subtitle">The only breathing app that treats breathwork as a discipline, not an afterthought.</p>
        <a href="#" class="btn-primary">Download on the App Store</a>
    </section>

    <section class="techniques" id="techniques">
        <h2 class="section-title">Master Your State</h2>
        <div class="grid">
            <div class="card"><div class="card-name">Wim Hof</div><div class="card-tagline">Energize</div><div class="card-intention">Physical Endurance</div></div>
            <div class="card"><div class="card-name">Box</div><div class="card-tagline">Sharp Focus</div><div class="card-intention">Nervous System Reset</div></div>
            <div class="card"><div class="card-name">Huberman</div><div class="card-tagline">Quick Reset</div><div class="card-intention">Fast Reset & Calm</div></div>
            <div class="card"><div class="card-name">SEAL</div><div class="card-tagline">Control</div><div class="card-intention">Nervous System Reset</div></div>
            <div class="card"><div class="card-name">Sleep</div><div class="card-tagline">Good Night</div><div class="card-intention">Deep Relaxation</div></div>
            <div class="card"><div class="card-name">Calm</div><div class="card-tagline">Coherence</div><div class="card-intention">Coherence & Flow</div></div>
            <div class="card"><div class="card-name">Belly</div><div class="card-tagline">Ground</div><div class="card-intention">Deep Relaxation</div></div>
            <div class="card"><div class="card-name">Release</div><div class="card-tagline">Let Go</div><div class="card-intention">Coherence & Flow</div></div>
            <div class="card"><div class="card-name">Custom</div><div class="card-tagline">Your Rhythm</div><div class="card-intention">Custom Flow</div></div>
        </div>
    </section>

    <section class="features">
        <div class="feature-item">
            <div class="feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </div>
            <h3>Eyes-closed sessions</h3>
            <p>Haptic feedback synced to every breath phase. No screen required.</p>
        </div>
        <div class="feature-item">
            <div class="feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            </div>
            <h3>Fully configurable</h3>
            <p>Set your own inhale, exhale, hold durations, and cycle count.</p>
        </div>
        <div class="feature-item">
            <div class="feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <h3>No bloat</h3>
            <p>No ads, no sleep stories, no courses. Just breathwork.</p>
        </div>
    </section>

    <section class="social-proof">
        <div class="stars">★★★★★</div>
        <div class="rating-text">4.8 on the App Store</div>
        <div class="quotes-grid">
            <div class="quote-card">
                <p class="quote-text">"The most focused breathwork app I've used. The haptic feedback is a game changer for eyes-closed sessions."</p>
                <p>— User Review</p>
            </div>
            <div class="quote-card">
                <p class="quote-text">"Finally an app that doesn't push a meditation course on me when I just want to do box breathing."</p>
                <p>— User Review</p>
            </div>
        </div>
    </section>

    <section class="cta-section">
        <h2>Android coming soon</h2>
        <p class="subtitle" style="margin-top:0.5rem; margin-bottom: 0;">Join the waitlist to be notified.</p>
        <form class="waitlist-form" id="waitlist-form">
            <input type="email" name="email" placeholder="Your email address" required>
            <button type="submit" class="btn-primary" style="padding: 1rem 1.5rem;">Join Waitlist</button>
        </form>
        <p id="waitlist-msg" style="margin-top:1rem; color: var(--secondary); display:none;"></p>

        <div class="creator-block">
            <h3 style="font-weight: 400; font-size: 1.5rem; margin-bottom: 0.5rem;">Are you a creator?</h3>
            <p style="color: var(--text-muted); margin-bottom: 2rem;">Run a giveaway your audience will actually want.</p>
            <a href="creators.html" class="btn-secondary">Partner with us</a>
        </div>
    </section>

    <footer>
        <div class="footer-links">
            <a href="mailto:support@breathecollection.com">Support</a>
            <a href="#">App Store</a>
            <a href="#">Privacy Policy</a>
        </div>
        <p>&copy; Breathe Collection. All rights reserved.</p>
    </footer>

    <script>
    document.getElementById('waitlist-form').addEventListener('submit', async function(e) {
        e.preventDefault()
        const email = this.querySelector('input[type=email]').value
        const msg = document.getElementById('waitlist-msg')
        try {
            const res = await fetch('/api/waitlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            })
            msg.style.display = 'block'
            msg.textContent = res.ok ? "You're on the list." : "Something went wrong. Try again."
            msg.style.color = res.ok ? 'var(--secondary)' : 'var(--accent)'
            if (res.ok) this.reset()
        } catch {
            msg.style.display = 'block'
            msg.textContent = "Something went wrong. Try again."
            msg.style.color = 'var(--accent)'
        }
    })
    </script>
</body>
</html>
```

### creators.html

Copy the full HTML below into `public/creators.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Breathe Collection | Creator Program</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #000000;
            --primary: #2C7873;
            --secondary: #52AB98;
            --accent: #E07B39;
            --text-main: #FFFFFF;
            --text-muted: #A0A0A0;
            --card-bg: rgba(255, 255, 255, 0.03);
            --card-border: rgba(255, 255, 255, 0.08);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Outfit', sans-serif; background-color: var(--bg); color: var(--text-main); line-height: 1.6; letter-spacing: 0.02em; -webkit-font-smoothing: antialiased; }
        section { padding: 5rem 1.5rem; max-width: 900px; margin: 0 auto; }
        .hero { text-align: center; padding-top: 8rem; padding-bottom: 3rem; }
        h1 { font-size: clamp(2rem,5vw,3.5rem); font-weight: 300; letter-spacing: -0.02em; margin-bottom: 1rem; line-height: 1.2; }
        .subtitle { font-size: clamp(1rem,2vw,1.2rem); color: var(--text-muted); max-width: 600px; margin: 0 auto; font-weight: 300; }
        .value-prop { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem; margin-bottom: 4rem; }
        .perk { background: var(--card-bg); border: 1px solid var(--card-border); padding: 2rem; border-radius: 12px; }
        .perk h3 { font-weight: 500; color: var(--secondary); margin-bottom: 0.5rem; }
        .perk p { color: var(--text-muted); font-weight: 300; font-size: 0.95rem; }
        .flow-container { text-align: center; margin-bottom: 6rem; }
        .flow-steps { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 1.5rem; margin-top: 2rem; }
        .step { display: flex; align-items: center; gap: 1.5rem; }
        .step-text { background: rgba(82,171,152,0.1); color: var(--secondary); padding: 0.8rem 1.5rem; border-radius: 100px; font-weight: 400; font-size: 0.95rem; }
        .arrow { color: var(--card-border); }
        @media (max-width: 768px) { .step { flex-direction: column; } .arrow { transform: rotate(90deg); } }
        .application-form { background: var(--card-bg); border: 1px solid var(--card-border); padding: 3rem; border-radius: 16px; margin-bottom: 6rem; }
        .application-form h2 { font-weight: 300; margin-bottom: 2rem; text-align: center; }
        .form-group { margin-bottom: 1.5rem; }
        .form-group label { display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.9rem; }
        .form-control { width: 100%; padding: 1rem; border-radius: 8px; border: 1px solid var(--card-border); background: rgba(0,0,0,0.3); color: white; font-family: inherit; outline: none; transition: border-color 0.3s ease; }
        .form-control:focus { border-color: var(--secondary); }
        select.form-control { appearance: none; background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e"); background-repeat: no-repeat; background-position: right 1rem center; background-size: 1em; }
        textarea.form-control { resize: vertical; min-height: 120px; }
        .btn-submit { width: 100%; background-color: var(--text-main); color: var(--bg); padding: 1.2rem; border-radius: 8px; border: none; font-size: 1.1rem; font-weight: 500; cursor: pointer; transition: transform 0.3s ease; margin-top: 1rem; font-family: inherit; }
        .btn-submit:hover { transform: translateY(-2px); }
        .faq { margin-bottom: 5rem; }
        .faq h2 { font-weight: 300; margin-bottom: 2rem; text-align: center; }
        .faq-item { border-bottom: 1px solid var(--card-border); padding: 1.5rem 0; }
        .faq-q { font-weight: 500; color: var(--secondary); margin-bottom: 0.5rem; }
        .faq-a { color: var(--text-muted); font-weight: 300; }
        footer { text-align: center; padding: 4rem 1.5rem; border-top: 1px solid var(--card-border); color: var(--text-muted); font-size: 0.9rem; }
        footer a { color: var(--secondary); text-decoration: none; margin: 0 1rem; transition: color 0.3s ease; }
        footer a:hover { color: var(--text-main); }
    </style>
</head>
<body>
    <section class="hero">
        <h1>Partner with Breathe Collection</h1>
        <p class="subtitle">Free lifetime Pro access. Run a giveaway your audience will actually want.</p>
    </section>

    <section>
        <div class="value-prop">
            <div class="perk"><h3>Free lifetime Pro</h3><p>Yours to keep, no obligations, no expiry.</p></div>
            <div class="perk"><h3>Giveaway codes</h3><p>Lifetime or 1-year Pro codes to give away to your followers. Easy engagement content.</p></div>
            <div class="perk"><h3>Early access</h3><p>Experience new features and patterns before they go public.</p></div>
        </div>

        <div class="flow-container">
            <h2 style="font-weight: 300; margin-bottom: 1rem;">How it works</h2>
            <div class="flow-steps">
                <div class="step"><div class="step-text">Apply</div><div class="arrow">→</div></div>
                <div class="step"><div class="step-text">Get approved</div><div class="arrow">→</div></div>
                <div class="step"><div class="step-text">Receive codes</div><div class="arrow">→</div></div>
                <div class="step"><div class="step-text">Post your giveaway</div></div>
            </div>
        </div>

        <div class="application-form">
            <h2>Apply Now</h2>
            <form id="creator-form">
                <div class="form-group"><label>Name</label><input type="text" name="name" class="form-control" required></div>
                <div class="form-group"><label>Email Address</label><input type="email" name="email" class="form-control" required></div>
                <div class="form-group"><label>Instagram / TikTok Handle</label><input type="text" name="handle" class="form-control" placeholder="@username" required></div>
                <div class="form-group">
                    <label>Platform</label>
                    <select name="platform" class="form-control" required>
                        <option value="">Select primary platform</option>
                        <option value="instagram">Instagram</option>
                        <option value="tiktok">TikTok</option>
                        <option value="youtube">YouTube</option>
                        <option value="twitter">X / Twitter</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Follower Count</label>
                    <select name="followers" class="form-control" required>
                        <option value="">Select range</option>
                        <option value="<10k">&lt; 10k</option>
                        <option value="10k-50k">10k - 50k</option>
                        <option value="50k-150k">50k - 150k</option>
                        <option value="150k+">150k+</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Your Niche</label>
                    <select name="niche" class="form-control" required>
                        <option value="">Select niche</option>
                        <option value="biohacking">Biohacking</option>
                        <option value="fitness">Fitness</option>
                        <option value="mindfulness">Mindfulness</option>
                        <option value="sleep">Sleep</option>
                        <option value="productivity">Productivity</option>
                        <option value="anxiety">Anxiety / Mental Health</option>
                        <option value="cold_exposure">Cold Exposure</option>
                        <option value="other">Other</option>
                    </select>
                </div>
                <div class="form-group"><label>Why do you want to partner?</label><textarea name="reason" class="form-control" required></textarea></div>
                <button type="submit" class="btn-submit">Submit Application</button>
            </form>
            <p id="creator-msg" style="margin-top:1rem; text-align:center; display:none;"></p>
        </div>

        <div class="faq">
            <h2>FAQ</h2>
            <div class="faq-item"><div class="faq-q">Do I need a minimum following?</div><div class="faq-a">No minimum. We care about niche fit and engagement over raw numbers. Micro-creators in the right niche consistently outperform larger generalist accounts.</div></div>
            <div class="faq-item"><div class="faq-q">How many giveaway codes do I get?</div><div class="faq-a">Typically 3-5 to start. If your giveaway performs well, we'll send more.</div></div>
            <div class="faq-item"><div class="faq-q">Do I have to post on a specific schedule?</div><div class="faq-a">No obligations. Use the app honestly, and share it if it genuinely fits your content.</div></div>
            <div class="faq-item"><div class="faq-q">Can I also have a referral link?</div><div class="faq-a">Yes — reply to your welcome email and we'll set one up. You earn 25% commission on any subscriptions your link drives.</div></div>
        </div>
    </section>

    <footer>
        <p style="margin-bottom: 1rem;"><a href="index.html">← Back to Breathe Collection</a></p>
        <p>&copy; Breathe Collection. All rights reserved.</p>
    </footer>

    <script>
    document.getElementById('creator-form').addEventListener('submit', async function(e) {
        e.preventDefault()
        const data = Object.fromEntries(new FormData(this))
        const msg = document.getElementById('creator-msg')
        try {
            const res = await fetch('/api/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
            msg.style.display = 'block'
            msg.textContent = res.ok
                ? "Application received. We'll be in touch."
                : "Something went wrong. Try again."
            msg.style.color = res.ok ? 'var(--secondary)' : 'var(--accent)'
            if (res.ok) this.reset()
        } catch {
            msg.style.display = 'block'
            msg.textContent = "Something went wrong. Try again."
            msg.style.color = 'var(--accent)'
        }
    })
    </script>
</body>
</html>
```

**Step 3: Commit**

```bash
git add public/
git commit -m "feat: add static frontend with fetch-based form submission"
```

---

## Task 9: Local Smoke Test

**Step 1: Create `.env` from example**

```bash
cp .env.example .env
```

Fill in real values:
- `DATABASE_URL` — a local or remote PostgreSQL connection string
- `SMTP_HOST` — e.g. `smtp.gmail.com`
- `SMTP_PORT` — `587`
- `SMTP_USER` — your Gmail address
- `SMTP_PASS` — Gmail app password (generate at myaccount.google.com → Security → App passwords)

**Step 2: Run migration**

```bash
npm run migrate
```

Expected output: `Migration complete`

**Step 3: Start server**

```bash
npm start
```

Expected: `Server running on port 3000`

**Step 4: Test in browser**

- Open `http://localhost:3000` — landing page loads
- Open `http://localhost:3000/creators.html` — creator page loads
- Submit waitlist form — verify success message appears, email arrives at support address, row in `waitlist` table
- Submit creator form — verify success message appears, email arrives, row in `contacts` table

**Step 5: Run all tests**

```bash
npm test
```

Expected: All 4 tests PASS

---

## Task 10: Deploy to Railway

**Step 1: Push to GitHub**

Create a new GitHub repo named `app-launch-os` (public or private, your choice). Then:

```bash
git remote add origin https://github.com/<your-username>/app-launch-os.git
git push -u origin main
```

**Step 2: Enable Template Repository**

In GitHub: go to the `app-launch-os` repo → Settings → scroll to "Template repository" → check the box. This enables one-click client forks.

**Step 3: Create Railway project**

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo → select `app-launch-os`
2. In the project, click "+ New" → Database → PostgreSQL
3. Railway automatically sets `DATABASE_URL` in your service's environment — verify it appears under Variables

**Step 4: Add remaining environment variables in Railway**

In the service Variables tab, add:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `NODE_ENV` = `production`

**Step 5: Run migration against production DB**

Install Railway CLI if needed:
```bash
npm install -g @railway/cli
railway login
```

Then:
```bash
railway run npm run migrate
```

Expected: `Migration complete`

**Step 6: Verify deploy**

Railway deploys automatically on push. Check the deploy logs — look for `Server running on port <PORT>`. Visit the Railway-provided URL and smoke test both forms.

---

## Task 11: Fork for Breathe Collection Client

**Step 1: Fork `app-launch-os` on GitHub**

Go to `app-launch-os` → "Use this template" → "Create a new repository" → name it `breathe-collection-web`.

**Step 2: Clone and install**

```bash
git clone https://github.com/<your-username>/breathe-collection-web.git
cd breathe-collection-web
npm install
```

**Step 3: Verify `config/app.js`**

Confirm `appName` is `'Breathe Collection'` and `supportEmail` is `'support@breathecollection.com'`. No other changes needed for this client.

**Step 4: Create a separate Railway project for the client**

Repeat Task 10 steps 3–6 for the `breathe-collection-web` repo. This gives Breathe Collection its own isolated Railway project, DB, and deploy pipeline.

**Step 5: Commit**

```bash
git add .
git commit -m "chore: breathe collection client — initial setup"
git push
```

---

## Done

At this point:
- `app-launch-os` is a live GitHub template on Railway
- `breathe-collection-web` is the Breathe Collection production deployment
- Both forms submit to PostgreSQL and trigger email notifications
- Adding a future client = fork template + edit `config/app.js` + new Railway project
