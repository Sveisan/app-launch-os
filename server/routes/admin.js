const express = require('express');
const router = express.Router();
const { pool } = require('../db/index');
const { renderAdminDashboard, renderLogin, renderManual } = require('../templates/admin');
const { scoutAgentRun } = require('../jobs/scout');
const { comparePassword, generateToken, verifyToken } = require('../db/auth');
const { checkAuth, ownerOnly } = require('../middleware/auth');



// Routes below this point are unprotected or handle their own auth



router.get('/login', (req, res) => {
    // If already logged in, go to dashboard
    if (req.cookies && req.cookies.admin_jwt && verifyToken(req.cookies.admin_jwt)) {
        return res.redirect('/mission-control-x89');
    }
    res.send(renderLogin());
});

router.get('/manual', checkAuth, (req, res) => {
    res.send(renderManual());
});

router.post('/login', async (req, res) => {
    try {
        if (!req.body) {
            throw new Error('No body received in POST /login. Is urlencoded middleware configured?');
        }
        
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.send(renderLogin('Email and password are required.'));
        }

        const result = await pool.query('SELECT * FROM admin_users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (user && await comparePassword(password, user.password_hash)) {
            const token = generateToken(user);
            res.cookie('admin_jwt', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
            });
            res.redirect('/mission-control-x89');
        } else {
            res.send(renderLogin('Invalid email or password'));
        }
    } catch (err) {
        console.error('[CRITICAL] Login Route Error:', err);
        res.status(500).send(renderLogin(`System error: ${err.message}. Please contact the owner.`));
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie('admin_jwt');
    res.json({ success: true });
});

router.post('/repair', checkAuth, ownerOnly, async (req, res) => {
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

router.post('/trigger', checkAuth, ownerOnly, async (req, res) => {
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
        
        // 6. Leads grouped by pipeline_status (Limited per column for performance)
        const leadsRes = await pool.query(`
            SELECT id, handle, platform, fit_score, niche, outreach_draft, post_url, pipeline_status, fit_feedback, reason, followers, followers_count, engagement_rate, bio, post_caption
            FROM contacts 
            WHERE scout_logged = TRUE 
            ORDER BY fit_score DESC NULLS LAST, created_at DESC
        `);
        
        // Group leads with a limit per category
        const pipelineStatus = {
            discovery: [],
            researching: [],
            approved: [],
            outreach_sent: [],
            rejected: []
        };
        
        const LIMIT_PER_COLUMN = 40;
        leadsRes.rows.forEach(lead => {
            const status = lead.pipeline_status || 'discovery';
            if (pipelineStatus[status] && pipelineStatus[status].length < LIMIT_PER_COLUMN) {
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

        const html = renderAdminDashboard(stats, req.user.role);
        res.send(html);
    } catch (err) {
        console.error('Admin Dashboard Error:', err);
        res.status(500).send(`Admin Error: ${err.message}`);
    }
});

router.post('/test-seed', checkAuth, ownerOnly, async (req, res) => {
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

router.post('/claim-code', checkAuth, async (req, res) => {
    try {
        const { handle } = req.body;
        if (!handle) return res.status(400).json({ success: false, error: 'Handle is required' });

        // 1. Check if handle already has a code
        const existing = await pool.query('SELECT code FROM offer_codes WHERE assigned_to_handle = $1', [handle]);
        if (existing.rows.length > 0) {
            return res.json({ success: true, code: existing.rows[0].code, alreadyAssigned: true });
        }

        // 2. Find and claim a new code
        const result = await pool.query(`
            UPDATE offer_codes 
            SET assigned_to_handle = $1, assigned_at = NOW() 
            WHERE id = (
                SELECT id FROM offer_codes 
                WHERE is_used = FALSE AND assigned_to_handle IS NULL 
                ORDER BY created_at ASC 
                LIMIT 1
            ) 
            RETURNING code
        `, [handle]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'No available promo codes found' });
        }

        res.json({ success: true, code: result.rows[0].code });
    } catch (err) {
        console.error('Claim Code Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
