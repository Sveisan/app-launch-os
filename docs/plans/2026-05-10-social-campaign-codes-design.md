# Social Campaign Codes — Design

Date: 2026-05-10

## Context

The owner is announcing the app on personal socials with a "comment 'breathe'
to get a free month" campaign. The existing `offer_codes` pool is shared with
the influencer pipeline and already populated with codes (iOS + Android, type
`trial`). We want a fast in-panel workflow to hand out codes one-at-a-time as
comments come in, while keeping the pipeline pool's bookkeeping clean.

## Decisions

- **Single shared pool, no schema changes.** Both pipeline and social
  giveaways draw from the same `offer_codes` rows. "Separation" is tracked
  at pull-time via the existing `used_by_email` field set to the literal
  string `'social-campaign'`.
- **Both admin roles get the buttons.** Owner and freelancer can both pull
  social codes (matches the freelancer access already given for the pipeline
  claim flow).
- **Two side-by-side buttons**, one per platform. No "either" auto-pick — the
  admin asks the commenter their platform first.
- **Trial codes only.** Lifetime codes are explicitly out of scope for the
  social giveaway.
- **Mark used immediately on pull.** `is_used = TRUE`, `used_at = NOW()`,
  `used_by_email = 'social-campaign'`. Code drops out of the available pool
  the moment it's copied; `FOR UPDATE SKIP LOCKED` prevents double-allocation.
- **No per-recipient tracking.** The admin DMs the redeem URL manually; we
  don't capture which IG handle received which code.
- **No public claim page.** Out of scope.

## Data flow

```
Admin clicks "Get iOS code"
  → POST /mission-control-x89/pull-social-code  { platform: "ios" }
    → UPDATE offer_codes SET is_used=TRUE, used_at=NOW(),
                              used_by_email='social-campaign'
       WHERE id = (SELECT id FROM offer_codes
                   WHERE platform=$1 AND type='trial'
                     AND is_used=FALSE AND assigned_to_handle IS NULL
                   LIMIT 1 FOR UPDATE SKIP LOCKED)
       RETURNING code
    → returns { code, redeemUrl }
  → UI shows code + auto-copies redeem URL to clipboard
  → "Last pulled" line updates so admin can re-grab if needed
```

Empty pool → 409 with a clear message.

## Admin panel widget

New "Social Campaign" card placed between the existing stats grid and the
Influencer Pipeline section. Visible to owner and freelancer.

Shows:
- Available pool: `<n> iOS · <m> Android` (same numbers as the existing
  pipeline counter — they share)
- Given out total: `COUNT(*) WHERE used_by_email = 'social-campaign'`
- Two buttons: `Get iOS code`, `Get Android code`
- "Last pulled" line: code + platform + Copy URL button (session-only,
  not persisted across reloads)

## Backend changes

`server/routes/admin.js`:
- Extend dashboard stats query to include `socialGivenOut` count.
- New `POST /pull-social-code` handler (auth: any logged-in admin).

`server/templates/admin.js`:
- Inject the new widget after the stats grid (around line 291).
- Add JS handlers for the two buttons and the "Last pulled" / Copy URL UI.

## Files touched

- `server/routes/admin.js` — extend dashboard query, add endpoint.
- `server/templates/admin.js` — new widget + button JS.

## Files NOT touched

- `server/db/migrate.js` — no schema change.
- `scripts/import-codes.js` — unchanged.
- `server/routes/eligibility.js`, `scripts/approve-post.js` — unchanged.

## Out of scope

- Public self-serve claim page.
- Comment-fetching / verification automation.
- Per-recipient (handle) tracking.
- Lifetime codes for the social campaign.
- A separate `campaign` column or any retag tooling.

## Risks

- **Shared pool drain**: a viral comment could deplete codes the owner wanted
  for high-leverage creators. Mitigation: the dashboard counter is shared,
  so the owner sees the pool shrink in real time and can stop the campaign
  manually. Acceptable for the size of this giveaway.
- **Double-allocation**: prevented by `FOR UPDATE SKIP LOCKED` + `code`
  unique constraint. Same pattern the pipeline claim already uses.
