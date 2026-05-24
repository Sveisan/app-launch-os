const express = require('express');
const router = express.Router();
const { checkAuth } = require('../middleware/auth');
const { pullSocialCode } = require('../services/offer-codes');

router.post('/pull', checkAuth, async (req, res) => {
  const { platform: rawPlatform, type: rawType } = req.body || {};
  const platform = ['ios', 'android'].includes(rawPlatform) ? rawPlatform : null;
  const type = ['trial', 'lifetime'].includes(rawType) ? rawType : null;

  if (!platform || !type) {
    return res.status(400).json({ success: false, error: 'platform and type are required' });
  }

  try {
    const result = await pullSocialCode(platform, type);
    if (!result) {
      return res.status(409).json({
        success: false,
        outOfStock: true,
        error: 'No ' + platform + ' ' + type + ' codes left — ping support',
      });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Pull Promo Code Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
