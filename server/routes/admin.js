const express = require('express');
const router = express.Router();
const { pool } = require('../db/index');
const { renderAdminDashboard } = require('../templates/admin');
const { scoutAgentRun } = require('../jobs/scout');

// Simple Access Key Middleware
const SECRET_KEY = 'breathe88';
const checkAuth = (req, res, next) => {
    const key = req.query.auth || req.body.auth;
    if (key === SECRET_KEY) {
        next();
    } else {
        res.status(404).send('Not Found');
    }
};

router.post('/repair', checkAuth, async (req, res) => {
    try {
        console.log('Manual DB Repair Triggered...');
        
        // 1. Repair Contacts
        await pool.query(`
            ALTER TABLE contacts 
            ADD COLUMN IF NOT EXISTS fit_score DECIMAL,
            ADD COLUMN IF NOT EXISTS engagement_rate DECIMAL,
            ADD COLUMN IF NOT EXISTS outreach_draft TEXT,
            ADD COLUMN IF NOT EXISTS scout_logged BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS fit_feedback TEXT
        `);

        // 3. Force Sync existing high-score leads (The "Rescue" Operation)
        await pool.query(`
            UPDATE contacts 
            SET scout_logged = TRUE 
            WHERE fit_score IS NOT NULL 
            AND scout_logged = FALSE
        `);

        res.json({ success: true, message: 'Database repaired and existing leads synchronized.' });
    } catch (err) {
        console.error('Repair Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/trigger', checkAuth, async (req, res) => {
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

router.get('/', checkAuth, async (req, res) => {
    try {
        // 1. Health Check (Checks for both columns and log table)
        const healthCheck = await pool.query(`
            SELECT table_name FROM information_schema.tables WHERE table_name = 'scout_logs'
        `);
        const colCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'scout_logged'
        `);
        
        const isDbReady = healthCheck.rows.length > 0 && colCheck.rows.length > 0;

        // 2. Total Scout Leads
        const scoutRes = await pool.query("SELECT COUNT(*) FROM contacts WHERE scout_logged = TRUE");
        
        // 3. Total Waitlist
        const waitlistRes = await pool.query("SELECT COUNT(*) FROM waitlist");
        
        // 4. Creator Applications
        const creatorRes = await pool.query("SELECT COUNT(*) FROM contacts WHERE scout_logged = FALSE");
        
        // 5. Offer Codes Left
        const codesRes = await pool.query("SELECT COUNT(*) FROM offer_codes WHERE is_used = FALSE");
        
        // 6. Latest 10 Leads
        const leadsRes = await pool.query(`
            SELECT handle, platform, fit_score, niche, outreach_draft, post_url 
            FROM contacts 
            WHERE scout_logged = TRUE 
            ORDER BY created_at DESC 
            LIMIT 10
        `);

        // 7. System Logs
        const logsRes = await pool.query(`
            SELECT message, created_at 
            FROM scout_logs 
            ORDER BY created_at DESC 
            LIMIT 10
        `);

        const stats = {
            isDbReady,
            scoutLeads: scoutRes.rows[0].count,
            waitlistTotal: waitlistRes.rows[0].count,
            creatorApps: creatorRes.rows[0].count,
            codesLeft: codesRes.rows[0].count,
            latestLeads: leadsRes.rows[0] ? leadsRes.rows : [],
            systemLogs: logsRes.rows[0] ? logsRes.rows : []
        };

        const html = renderAdminDashboard(stats);
        res.send(html);
    } catch (err) {
        console.error('Admin Dashboard Error:', err);
        res.status(500).send(`Admin Error: ${err.message}`);
    }
});

router.get('/debug', checkAuth, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM contacts ORDER BY created_at DESC LIMIT 50");
        res.json({ 
            success: true, 
            count: result.rowCount,
            data: result.rows 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
