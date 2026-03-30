# Breathe Collection Website — Design Doc
*2026-03-27*

## Context

Breathe Collection is an iOS breathing exercise app. This website serves as the public point of contact for influencer partnerships, live event inquiries, access code requests, and general informational purposes.

## Repo Strategy

**Option B — Template repo + fork per client.**

- `app-launch-os` — GitHub template repo. Contains the full framework: Express server, DB schema, email system, config surface, and static frontend. Enable "Template repository" in GitHub repo settings.
- `breathe-collection-web` — First client repo, forked from `app-launch-os`. Lives under personal GitHub account until an agency org is established (moving repos between orgs is painless).
- Each new client = one-click fork from template + edit `config/app.js`.

## Architecture

```
app-launch-os/
├── public/
│   ├── index.html        # Main app landing page
│   ├── creators.html     # Creator partnership page
│   └── assets/
├── config/
│   └── app.js            # All client-specific values (name, email, etc.)
├── server/
│   ├── index.js          # Express entry point
│   ├── routes/
│   │   ├── creator.js    # POST /api/apply
│   │   └── waitlist.js   # POST /api/waitlist
│   ├── db/
│   │   └── index.js      # PostgreSQL client (node-postgres)
│   └── email/
│       └── index.js      # Nodemailer config
├── package.json
└── railway.toml
```

## Config

`config/app.js` exports a single object centralising all client-specific values:

```js
module.exports = {
  appName: 'Breathe Collection',
  supportEmail: 'support@breathecollection.com',
  // smtp, db, etc.
}
```

Every other file imports from here. Nothing hardcoded elsewhere. Swapping clients = edit one file.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/apply | Creator partnership application |
| POST | /api/waitlist | Android waitlist signup |

Each endpoint: validate fields → insert to PostgreSQL → send email notification.

## Database Schema

### `contacts`
Creator partnership applications. Compatible with future modules: Reddit monitor, influencer builder, affiliate onboarding.

| Column | Type |
|--------|------|
| id | SERIAL PRIMARY KEY |
| name | TEXT |
| email | TEXT |
| handle | TEXT |
| platform | TEXT |
| followers | TEXT |
| niche | TEXT |
| reason | TEXT |
| created_at | TIMESTAMPTZ DEFAULT NOW() |

### `waitlist`
Android waitlist signups.

| Column | Type |
|--------|------|
| id | SERIAL PRIMARY KEY |
| email | TEXT |
| created_at | TIMESTAMPTZ DEFAULT NOW() |

### `affiliates` *(stub — future module)*
| Column | Type |
|--------|------|
| id | SERIAL PRIMARY KEY |
| created_at | TIMESTAMPTZ DEFAULT NOW() |

### `conversations` *(stub — future module)*
| Column | Type |
|--------|------|
| id | SERIAL PRIMARY KEY |
| created_at | TIMESTAMPTZ DEFAULT NOW() |

## Email

Nodemailer with SMTP (Gmail app password or SendGrid free tier). One notification email per submission sent to `supportEmail` from config. Credentials stored as Railway environment variables.

## Frontend Changes

Minimal. The existing HTML/CSS design is preserved entirely. Only changes:
- Form `action`/`method` replaced with a small `fetch()` call to the API
- Inline success/error message shown after submission

## Hosting

Railway. PostgreSQL plugin attached to the project. `railway.toml` configures the start command. Environment variables: `DATABASE_URL`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`.

## Future Modules (noted for DB compatibility)

- Reddit monitor → reads from `contacts`
- Influencer builder → reads from `contacts`
- Affiliate onboarding → reads from `affiliates`
- Conversations → reads from `conversations`
