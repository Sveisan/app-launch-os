const express = require('express');
const router = express.Router();
const { pool } = require('../db/index');
const { renderAdminDashboard } = require('../templates/admin');
const { scoutAgentRun } = require('../jobs/scout');

// Hardened Access Key Middleware
const checkAuth = (req, res, next) => {
    const secret = process.env.ADMIN_SECRET_KEY || 'breathe88';
    
    // Check cookie first, or query/body for initial login
    const providedKey = req.cookies.admin_auth || req.query.auth || req.body.auth;
    
    if (providedKey === secret) {
        // Set cookie if auth was provided via query/body
        if (!req.cookies.admin_auth && providedKey) {
            res.cookie('admin_auth', secret, { 
                httpOnly: true, 
                secure: process.env.NODE_ENV === 'production',
                maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
            });
        }
        next();
    } else {
        // Return 404 to hide the existence of the admin page from scanners
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
        
        // 6. Leads grouped by pipeline_status
        const leadsRes = await pool.query(`
            SELECT id, handle, platform, fit_score, niche, outreach_draft, post_url, pipeline_status, fit_feedback, reason, followers, followers_count, engagement_rate, bio, post_caption
            FROM contacts 
            WHERE scout_logged = TRUE 
            ORDER BY created_at DESC 
            LIMIT 1000
        `);
        
        // Group leads
        const pipelineStatus = {
            discovery: [],
            researching: [],
            approved: [],
            outreach_sent: [],
            rejected: []
        };
        
        leadsRes.rows.forEach(lead => {
            const status = lead.pipeline_status || 'discovery';
            if (pipelineStatus[status]) {
                pipelineStatus[status].push(lead);
            }
        });

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
            pipelineStatus,
            systemLogs: logsRes.rows[0] ? logsRes.rows : []
        };

        const html = renderAdminDashboard(stats);
        res.send(html);
    } catch (err) {
        console.error('Admin Dashboard Error:', err);
        res.status(500).send(`Admin Error: ${err.message}`);
    }
});

router.post('/test-seed', checkAuth, async (req, res) => {
    try {
        console.log('Test Seed Triggered...');
        const testHandle = `scout_test_${Math.floor(Math.random() * 1000)}`;
        await pool.query(`
            INSERT INTO contacts (
                handle, platform, followers_count, niche, reason, 
                status, post_url, fit_score, scout_logged, created_at
            ) VALUES ($1, 'Instagram', 1500, 'Test', 'Diagnostic Mock Run', 'draft', 'http://test.com', 0.95, TRUE, NOW())
            ON CONFLICT (handle) DO UPDATE SET scout_logged = TRUE, created_at = NOW()
        `, [testHandle]);
        
        res.json({ success: true, message: `Mock lead @${testHandle} generated.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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

router.post('/update-status', checkAuth, async (req, res) => {
    try {
        const { id, status } = req.body;
        const validStatuses = ['discovery', 'researching', 'approved', 'outreach_sent', 'rejected'];
        
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid pipeline status' });
        }
        
        await pool.query(`
            UPDATE contacts 
            SET pipeline_status = $1 
            WHERE id = $2
        `, [status, id]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Update Status Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
