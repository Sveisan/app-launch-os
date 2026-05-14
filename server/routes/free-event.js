const express = require('express');
const router = express.Router();
const { pool } = require('../db/index');
const config = require('../../config/app');

// GET /api/free-event/status
// Returns current code availability, deadline, and expiration status
router.get('/status', async (req, res) => {
  try {
    const now = new Date();
    const deadline = new Date(config.freeEventDeadline);
    const expired = now > deadline;

    // Query codes by platform
    const result = await pool.query(`
      SELECT platform, COUNT(*) as total, SUM(CASE WHEN is_used = TRUE THEN 1 ELSE 0 END) as claimed
      FROM offer_codes
      WHERE campaign = 'free-event-2026'
      GROUP BY platform
    `);

    const status = { ios: { total: 10, claimed: 0 }, android: { total: 10, claimed: 0 } };
    result.rows.forEach(row => {
      const platform = row.platform || 'ios';
      if (status[platform]) {
        status[platform].total = parseInt(row.total) || 10;
        status[platform].claimed = parseInt(row.claimed) || 0;
      }
    });

    res.json({
      ios: status.ios,
      android: status.android,
      deadline: config.freeEventDeadline,
      expired,
    });
  } catch (err) {
    console.error('Free Event Status Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/free-event/claim
// Claims a code for a platform, returns redemption URL
router.post('/claim', async (req, res) => {
  try {
    const { platform: rawPlatform } = req.body || {};
    const platform = ['ios', 'android'].includes(rawPlatform) ? rawPlatform : null;

    // Validate platform
    if (!platform) {
      return res.status(400).json({ error: 'platform must be "ios" or "android"' });
    }

    // Check deadline
    const now = new Date();
    const deadline = new Date(config.freeEventDeadline);
    if (now > deadline) {
      return res.status(410).json({ error: 'expired' });
    }

    // Get client IP for abuse tracking
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

    // Check if IP has already claimed 3+ codes
    const claimCountResult = await pool.query(`
      SELECT COUNT(*) as count FROM free_event_claims WHERE ip = $1
    `, [clientIp]);
    const claimCount = parseInt(claimCountResult.rows[0].count) || 0;
    if (claimCount >= 3) {
      return res.status(410).json({ error: 'limit_reached' });
    }

    // Atomically claim a code
    const claimResult = await pool.query(`
      UPDATE offer_codes
      SET is_used = TRUE, used_at = NOW()
      WHERE id = (
        SELECT id FROM offer_codes
        WHERE campaign = 'free-event-2026'
          AND platform = $1
          AND is_used = FALSE
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING code
    `, [platform]);

    if (claimResult.rows.length === 0) {
      return res.status(410).json({ error: 'none_left' });
    }

    const code = claimResult.rows[0].code;

    // Record the claim for abuse tracking
    await pool.query(`
      INSERT INTO free_event_claims (ip, platform)
      VALUES ($1, $2)
    `, [clientIp, platform]);

    // Generate redemption URL
    const redemptionUrl = platform === 'android'
      ? `https://play.google.com/redeem?code=${encodeURIComponent(code)}`
      : `https://apps.apple.com/redeem?ctx=offercodes&id=6760255541&code=${encodeURIComponent(code)}`;

    res.json({ redemptionUrl });
  } catch (err) {
    console.error('Free Event Claim Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
