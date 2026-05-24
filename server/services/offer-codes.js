const { pool } = require('../db/index');

async function pullSocialCode(platform, type) {
  const result = await pool.query(`
    UPDATE offer_codes
    SET is_used = TRUE,
        used_at = NOW(),
        used_by_email = 'social-campaign'
    WHERE id = (
      SELECT id FROM offer_codes
      WHERE platform = $1
        AND type = $2
        AND is_used = FALSE
        AND assigned_to_handle IS NULL
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING code
  `, [platform, type]);

  if (result.rows.length === 0) return null;

  const code = result.rows[0].code;
  const redeemUrl = platform === 'android'
    ? 'https://play.google.com/redeem?code=' + encodeURIComponent(code)
    : 'https://apps.apple.com/redeem?ctx=offercodes&id=6760255541&code=' + encodeURIComponent(code);

  return { code, platform, type, redeemUrl };
}

module.exports = { pullSocialCode };
