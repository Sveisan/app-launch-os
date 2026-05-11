# Social Campaign — Lifetime Codes — Design

Date: 2026-05-11

## Context

The Social Campaign card currently only pulls 1-month trial codes. The pool
now contains 500 Android + 9999 iOS lifetime codes too, and the owner wants
to occasionally gift a lifetime code from the same one-click workflow when
a specific commenter warrants it.

## Decision

Extend the existing `Social Campaign` card with a second, de-emphasized row
for Lifetime codes. Trial stays primary (filled accent) so the casual
click-through still favors trial codes. Lifetime sits below a divider
labeled "Lifetime (gift sparingly)" with muted/ghost buttons, signaling
"think before clicking."

## Data model

No schema change. Both code types use `used_by_email = 'social-campaign'`
on pull. The dashboard stats query is extended to break out the
`social-campaign` total by `type` so the card can show "trial / lifetime"
given-out separately.

## Backend

`POST /pull-social-code` accepts an optional `type` field (`'trial'`
default, or `'lifetime'`). Same atomic claim pattern via
`FOR UPDATE SKIP LOCKED`. 409 on empty pool with type+platform in the
error message.

## UI

Two new buttons under a small divider:

- `Lifetime · iOS` (ghost style, secondary color)
- `Lifetime · Android` (ghost style, secondary color)

Existing `Last pulled` line shows the most recent pull regardless of
type — single source of truth.

## Files touched

- `server/routes/admin.js` — accept `type` in endpoint, extend stats
- `server/templates/admin.js` — add 2 buttons + divider, JS accepts type

## Out of scope

- No public claim page.
- No per-recipient tracking.
- No reward-tier restrictions or guardrails beyond the visual
  de-emphasis (the user is the only person clicking — trust the UI).
