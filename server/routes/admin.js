const express = require('express');
const router = express.Router();
const { pool } = require('../db/index');
const { renderAdminDashboard } = require('../templates/admin');
const { scoutAgentRun } = require('../jobs/scout');

router.post('/trigger', async (req, res) => {
    try {
        console.log('Manual Scout Trigger received. Launching background process...');
        
        // 1. Respond immediately to avoid timeout
        res.json({ success: true, message: 'Scout has been sent into the field. Refresh in 60s.' });

        // 2. Run the agent in the background
        scoutAgentRun().then(() => {
            console.log('Background Scout Sweep completed successfully.');
        }).catch(err => {
            console.error('Background Scout Sweep failed:', err);
        });
        
    } catch (err) {
        console.error('Trigger Route Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/', async (req, res) => {
    try {
        // 1. Total Scout Leads
        const scoutRes = await pool.query("SELECT COUNT(*) FROM contacts WHERE scout_logged = TRUE");
        
        // 2. Total Waitlist
        const waitlistRes = await pool.query("SELECT COUNT(*) FROM waitlist");
        
        // 3. Creator Applications (Status is usually 'creator' or not scout_logged)
        const creatorRes = await pool.query("SELECT COUNT(*) FROM contacts WHERE scout_logged = FALSE");
        
        // 4. Offer Codes Left
        const codesRes = await pool.query("SELECT COUNT(*) FROM offer_codes WHERE is_used = FALSE");
        
        // 5. Latest 10 Leads
        const leadsRes = await pool.query(`
            SELECT handle, platform, fit_score, niche, outreach_draft, post_url 
            FROM contacts 
            WHERE scout_logged = TRUE 
            ORDER BY created_at DESC 
            LIMIT 10
        `);

        const stats = {
            scoutLeads: scoutRes.rows[0].count,
            waitlistTotal: waitlistRes.rows[0].count,
            creatorApps: creatorRes.rows[0].count,
            codesLeft: codesRes.rows[0].count,
            latestLeads: leadsRes.rows[0] ? leadsRes.rows : []
        };

        const html = renderAdminDashboard(stats);
        res.send(html);
    } catch (err) {
        console.error('Admin Dashboard Error:', err);
        res.status(500).send('Unauthorized or Server Error');
    }
});

module.exports = router;
